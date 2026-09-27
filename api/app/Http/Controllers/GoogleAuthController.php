<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\GoogleIdTokenVerifier;
use App\Services\InvalidGoogleIdToken;
use App\Services\InviteException;
use App\Services\InviteRedemption;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Handles Google OAuth2 authentication via Socialite.
 */
class GoogleAuthController extends Controller
{
    private const STATE_COOKIE = 'gocast_oauth_state';

    /**
     * The invite code from the sign-up page, parked for the round trip through
     * Google. The popup URL is the only thing the SPA controls, so the code
     * rides in on the query string and waits in a cookie the same way the
     * CSRF state does. Redeeming it here, inside the callback, is what lets a
     * Google sign-up get exactly one welcome email: the Verified listener
     * sees the invite already applied and sends the Pro welcome instead of
     * the generic one, rather than the SPA redeeming afterwards and the
     * account getting both.
     */
    private const INVITE_COOKIE = 'gocast_oauth_invite';

    private const AUTH_COOKIE = 'token';

    /**
     * Initiate the stateless Google OAuth flow.
     *
     * Stateless is required because the API and frontend are on separate
     * domains, so session-based CSRF state cannot be shared.
     */
    public function redirect(Request $request): RedirectResponse
    {
        $state = Str::random(40);

        $response = Socialite::driver('google')
            ->stateless()
            ->with(['state' => $state])
            ->redirect()
            ->withCookie($this->flowCookie($request, self::STATE_COOKIE, hash('sha256', $state)));

        $invite = $request->string('invite')->trim()->value();

        // Same shape Invite::codeFor() produces; anything else is dropped
        // rather than carried into a cookie.
        if ($invite !== '' && preg_match('/^[A-Za-z0-9-]{1,40}$/', $invite)) {
            $response->withCookie($this->flowCookie($request, self::INVITE_COOKIE, $invite));
        }

        return $response;
    }

    /**
     * Handle the OAuth callback from Google.
     *
     * Returns a minimal HTML page that — when opened as a popup — sets the
     * HttpOnly Sanctum token cookie, then reports success to the opener via
     * postMessage with a strict target origin. When there's no opener (direct
     * full-page flow) it falls back to a query-string redirect into the SPA's
     * /auth/callback route.
     *
     * If the user already exists by email (e.g. registered with password),
     * their account is linked to Google. Email is auto-verified since Google
     * already confirmed ownership.
     */
    public function callback(Request $request, InviteRedemption $invites): Response
    {
        $frontendOrigin = $this->frontendOrigin();
        $state = $request->string('state')->value();
        $expectedStateHash = $request->cookie(self::STATE_COOKIE);

        if (! $expectedStateHash || ! hash_equals($expectedStateHash, hash('sha256', $state))) {
            return $this->callbackResponse([
                'type' => 'gocast-oauth',
                'error' => 'google_auth_failed',
            ], $frontendOrigin);
        }

        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable) {
            return $this->callbackResponse([
                'type' => 'gocast-oauth',
                'error' => 'google_auth_failed',
            ], $frontendOrigin);
        }

        [$user, $invite] = $this->signInGoogleUser(
            $invites,
            $googleUser->getId(),
            $googleUser->getEmail(),
            $googleUser->getName(),
            $googleUser->getAvatar(),
            $request->cookie(self::INVITE_COOKIE),
        );

        $payload = [
            'type' => 'gocast-oauth',
            'authenticated' => true,
        ];

        if ($invite !== null) {
            $payload['invite'] = $invite;
        }

        $token = $user->createToken('auth')->plainTextToken;

        return $this->callbackResponse($payload, $frontendOrigin, $this->authCookie($request, $token));
    }

    /**
     * Sign in with the ID token from the mobile app's "Sign in with Google"
     * sheet (Android Credential Manager).
     *
     * The app has no browser to carry the popup's cookie, so this takes the
     * token Google handed the app, verifies it here (GoogleIdTokenVerifier),
     * and returns a Sanctum token in the body, the same way login() does for
     * a request that names its device. Account linking, verification and an
     * invite behave exactly as in the web callback.
     */
    public function native(Request $request, GoogleIdTokenVerifier $verifier, InviteRedemption $invites): JsonResponse
    {
        $data = $request->validate([
            'id_token' => ['required', 'string', 'max:8192'],
            'device_name' => ['required', 'string', 'max:255'],
            'invite' => ['nullable', 'string', 'max:40'],
        ]);

        try {
            $google = $verifier->verify($data['id_token']);
        } catch (InvalidGoogleIdToken $e) {
            report($e);

            throw ValidationException::withMessages([
                'id_token' => 'Google sign-in failed. Please try again.',
            ]);
        }

        [$user, $invite] = $this->signInGoogleUser(
            $invites,
            $google['sub'],
            $google['email'],
            $google['name'],
            $google['picture'],
            $data['invite'] ?? null,
        );

        return response()->json([
            'data' => new UserResource($user->loadMissing('plan')),
            'token' => $user->createToken($data['device_name'])->plainTextToken,
            'invite' => $invite,
        ]);
    }

    /**
     * Find the account for a Google identity, link it to an existing
     * password account with the same email, or create it; apply an invite;
     * and mark the email verified, since Google has confirmed it.
     *
     * @return array{0: User, 1: array{applied: bool, plan?: string, message: string}|null}
     */
    private function signInGoogleUser(
        InviteRedemption $invites,
        string $googleId,
        string $email,
        ?string $name,
        ?string $avatar,
        mixed $inviteCode,
    ): array {
        $user = User::where('google_id', $googleId)->first();

        if (! $user) {
            $user = User::where('email', $email)->first();

            if ($user) {
                $user->update([
                    'google_id' => $googleId,
                    'avatar_url' => $user->avatar_url ?? $this->avatarUrl($avatar),
                ]);
            } else {
                $user = User::create([
                    'name' => $name ?? Str::before($email, '@'),
                    'email' => $email,
                    'google_id' => $googleId,
                    'avatar_url' => $this->avatarUrl($avatar),
                    'password' => null,
                ]);
            }
        }

        // Before the Verified event, so a brand-new account is still
        // unverified while the invite is applied (InviteRedemption then sends
        // nothing) and the listener below sends the single Pro welcome. An
        // account that was verified already gets its email from the
        // redemption itself, and no Verified event fires for it.
        //
        // Best effort: the person has authenticated with Google, so the
        // account stands whether or not the link still works. What went
        // wrong travels back for the client to show.
        $invite = null;

        if (is_string($inviteCode) && preg_match('/^[A-Za-z0-9-]{1,40}$/', $inviteCode)) {
            try {
                $redeemed = $invites->redeem($inviteCode, $user);
                $invite = [
                    'applied' => true,
                    'plan' => $redeemed->plan->name,
                    'message' => "You're on {$redeemed->plan->name}.",
                ];
            } catch (InviteException $e) {
                $invite = [
                    'applied' => false,
                    'message' => $e->getMessage(),
                ];
            }
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        return [$user, $invite];
    }

    /**
     * The Google profile photo URL, or null if we cannot store it.
     *
     * Google hands back lh3.googleusercontent.com/a-/ALV-Uj… URLs that run
     * past a kilobyte, and users.avatar_url is VARCHAR(2048). Both call
     * sites in callback() sit outside the only try/catch there, so an
     * oversized value used to surface as an uncaught 1406 that killed the
     * whole callback: no auth cookie, no postMessage, and no way for the
     * person to sign up.
     *
     * Dropped rather than truncated. A clipped URL is still a URL-shaped
     * string, so it would be stored happily and then render as a broken
     * image on every page showing that user, with nothing in the logs.
     * Null is the state every password-registered account is already in, so
     * the UI falls back to initials and nobody loses an account over a
     * picture.
     *
     * strlen() counts bytes where the column counts characters, which errs
     * on the safe side.
     */
    private function avatarUrl(?string $url): ?string
    {
        return $url !== null && $url !== '' && strlen($url) <= 2048 ? $url : null;
    }

    private function callbackResponse(array $payload, string $frontendOrigin, ?Cookie $authCookie = null): Response
    {
        $response = response()
            ->view('auth.google-callback', [
                'payload' => $payload,
                'frontendOrigin' => $frontendOrigin,
            ])
            ->withCookie(cookie()->forget(self::STATE_COOKIE, path: '/'))
            ->withCookie(cookie()->forget(self::INVITE_COOKIE, path: '/'));

        if ($authCookie) {
            $response->withCookie($authCookie);
        }

        return $response;
    }

    /**
     * A short-lived, HttpOnly cookie that only has to survive the redirect to
     * Google and back.
     */
    private function flowCookie(Request $request, string $name, string $value): Cookie
    {
        return cookie(
            $name,
            $value,
            minutes: 10,
            path: '/',
            secure: $request->isSecure(),
            httpOnly: true,
            sameSite: 'lax',
        );
    }

    private function authCookie(Request $request, string $token): Cookie
    {
        return cookie(
            self::AUTH_COOKIE,
            $token,
            (int) config('sanctum.expiration', 43200),
            '/',
            config('session.domain'),
            $request->isSecure(),
            true,
            false,
            'lax',
        );
    }

    /**
     * Normalize the configured frontend URL down to an origin
     * (scheme://host[:port]) — postMessage targetOrigin must be an origin,
     * not a path, and the stricter the better.
     */
    private function frontendOrigin(): string
    {
        $url = (string) config('services.frontend_url', 'http://localhost:3000');
        $parts = parse_url($url);

        if (! isset($parts['scheme'], $parts['host'])) {
            // Misconfigured env — fail loud rather than postMessage to '*'.
            abort(500, 'services.frontend_url is not a valid URL.');
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        return $parts['scheme'].'://'.$parts['host'].$port;
    }
}
