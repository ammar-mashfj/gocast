<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\InviteException;
use App\Services\InviteRedemption;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
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

        $user = User::where('google_id', $googleUser->getId())->first();

        if (! $user) {
            $user = User::where('email', $googleUser->getEmail())->first();

            if ($user) {
                $user->update([
                    'google_id' => $googleUser->getId(),
                    'avatar_url' => $user->avatar_url ?? $googleUser->getAvatar(),
                ]);
            } else {
                $user = User::create([
                    'name' => $googleUser->getName(),
                    'email' => $googleUser->getEmail(),
                    'google_id' => $googleUser->getId(),
                    'avatar_url' => $googleUser->getAvatar(),
                    'password' => null,
                ]);
            }
        }

        $payload = [
            'type' => 'gocast-oauth',
            'authenticated' => true,
        ];

        // Before the Verified event, so a brand-new account is still
        // unverified while the invite is applied (InviteRedemption then sends
        // nothing) and the listener below sends the single Pro welcome. An
        // account that was verified already gets its email from the
        // redemption itself, and no Verified event fires for it.
        //
        // Best effort: the person has authenticated with Google, so the
        // account stands whether or not the link still works. What went
        // wrong travels back in the payload for the SPA to show.
        $inviteCode = $request->cookie(self::INVITE_COOKIE);

        if (is_string($inviteCode) && $inviteCode !== '') {
            try {
                $invite = $invites->redeem($inviteCode, $user);
                $payload['invite'] = [
                    'applied' => true,
                    'plan' => $invite->plan->name,
                    'message' => "You're on {$invite->plan->name}.",
                ];
            } catch (InviteException $e) {
                $payload['invite'] = [
                    'applied' => false,
                    'message' => $e->getMessage(),
                ];
            }
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        $token = $user->createToken('auth')->plainTextToken;

        return $this->callbackResponse($payload, $frontendOrigin, $this->authCookie($request, $token));
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
