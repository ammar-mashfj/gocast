<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets browser clients authenticate with the HttpOnly `token` cookie while
 * keeping Sanctum's bearer-token guard as the single source of truth.
 */
class UseAuthTokenCookie
{
    private const AUTH_COOKIE = 'token';

    public function handle(Request $request, Closure $next): Response
    {
        $tokens = $this->authCookieValues($request);

        if (! $request->bearerToken() && $tokens !== []) {
            // Last wins: browsers send the older duplicate first (RFC 6265
            // sorts equal-path cookies by creation time), and the API only
            // ever writes the current, domain-scoped one.
            $request->headers->set('Authorization', 'Bearer '.end($tokens));
        }

        $response = $next($request);

        if (count($tokens) > 1) {
            $this->forgetLegacyHostOnlyCookie($request, $response);
        }

        return $response;
    }

    /**
     * Every `token` value the browser sent, in header order.
     *
     * `$request->cookie()` collapses duplicates and keeps the *first*, which
     * is the wrong one when a stale cookie shadows the current session — so
     * the raw header is the only reliable source here.
     *
     * @return list<string>
     */
    private function authCookieValues(Request $request): array
    {
        $tokens = [];

        foreach (explode(';', (string) $request->header('Cookie')) as $pair) {
            [$name, $value] = array_pad(explode('=', trim($pair), 2), 2, null);

            if ($name === self::AUTH_COOKIE && is_string($value) && $value !== '') {
                $tokens[] = urldecode($value);
            }
        }

        return $tokens;
    }

    /**
     * Expire the pre-SESSION_DOMAIN auth cookie that was scoped to the API
     * host only.
     *
     * Sessions created before `SESSION_DOMAIN=.gocast.fm` got a host-only
     * cookie, which is a distinct cookie from the domain-scoped one the app
     * writes now — so login and logout can neither overwrite nor clear it,
     * and it shadows every new session for as long as it lives. Deleting it
     * requires a Set-Cookie with a matching (absent) domain.
     */
    private function forgetLegacyHostOnlyCookie(Request $request, Response $response): void
    {
        $response->headers->setCookie(new Cookie(
            self::AUTH_COOKIE,
            '',
            1,
            '/',
            null,
            $request->isSecure(),
            true,
            false,
            'lax',
        ));
    }
}
