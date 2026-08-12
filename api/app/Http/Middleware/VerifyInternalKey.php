<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates server-to-server calls (MediaMTX lifecycle webhooks,
 * Liquidsoap now-playing pushes) using a shared secret in the X-Internal-Key
 * header. The shared secret is INTERNAL_API_KEY; configured in compose for
 * the mediamtx container and baked into per-station .liq files by the
 * Liquidsoap blade template.
 */
class VerifyInternalKey
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('services.internal_api_key');

        if (empty($expected)) {
            throw new \RuntimeException('INTERNAL_API_KEY is not configured');
        }

        if (! hash_equals($expected, (string) $request->header('X-Internal-Key'))) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }
}
