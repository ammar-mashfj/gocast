<?php

namespace App\Http\Controllers;

use App\Models\User;
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

        return Socialite::driver('google')
            ->stateless()
            ->with(['state' => $state])
            ->redirect()
            ->withCookie(cookie(
                self::STATE_COOKIE,
                hash('sha256', $state),
                minutes: 10,
                path: '/',
                secure: $request->isSecure(),
                httpOnly: true,
                sameSite: 'lax',
            ));
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
    public function callback(Request $request): Response
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

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        $token = $user->createToken('auth')->plainTextToken;

        return $this->callbackResponse([
            'type' => 'gocast-oauth',
            'authenticated' => true,
        ], $frontendOrigin, $this->authCookie($request, $token));
    }

    private function callbackResponse(array $payload, string $frontendOrigin, ?Cookie $authCookie = null): Response
    {
        $response = response()
            ->view('auth.google-callback', [
                'payload' => $payload,
                'frontendOrigin' => $frontendOrigin,
            ])
            ->withCookie(cookie()->forget(self::STATE_COOKIE, path: '/'));

        if ($authCookie) {
            $response->withCookie($authCookie);
        }

        return $response;
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
