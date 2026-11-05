<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
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

        // Misconfigured, not under attack: refuse without throwing. The events
        // are bound on Icecast's default mount, so every Pro container start
        // and standby restart lands here too; an exception each time buried
        // the logs. One warning per ten minutes says what is wrong.
        if ($expected === '') {
            if (Cache::add('icecast-callback-unconfigured-warned', true, 600)) {
                Log::warning('ICECAST_CALLBACK_PASSWORD is not configured: refusing every Icecast callback, so no Free station can go live');
            }

            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $userMatches = hash_equals((string) config('relay.callback_user'), (string) $request->getUser());
        $passwordMatches = hash_equals($expected, (string) $request->getPassword());

        if (! $userMatches || ! $passwordMatches) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }
}
