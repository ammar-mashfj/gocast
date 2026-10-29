<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates Icecast's own callbacks — the url role that admits relay
 * broadcasters and the source-connect/disconnect event bindings.
 *
 * Icecast can only send HTTP Basic auth on these, not the X-Internal-Key the
 * station containers use, so they carry a credential of their own:
 * ICECAST_CALLBACK_USER / ICECAST_CALLBACK_PASSWORD, rendered into
 * icecast.xml by setup-native.sh.
 */
class VerifyIcecastCallback
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('relay.callback_password');

        if ($expected === '') {
            throw new \RuntimeException('ICECAST_CALLBACK_PASSWORD is not configured');
        }

        $userMatches = hash_equals((string) config('relay.callback_user'), (string) $request->getUser());
        $passwordMatches = hash_equals($expected, (string) $request->getPassword());

        if (! $userMatches || ! $passwordMatches) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }
}
