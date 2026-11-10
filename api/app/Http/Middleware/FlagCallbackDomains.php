<?php

namespace App\Http\Middleware;

use App\Services\SecuritySignals;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Raises a Telegram alert when a request carries an out-of-band callback host
 * (dnslog.cn and friends, config/security.php) in its input or headers.
 *
 * Skips webhooks and the stations' internal callbacks, whose bodies are
 * other systems' data.
 *
 * Observe only: the request continues untouched. Validation decides what is
 * accepted; this only makes sure somebody hears that it was tried.
 */
class FlagCallbackDomains
{
    public function __construct(private readonly SecuritySignals $signals) {}

    public function handle(Request $request, Closure $next): Response
    {
        // Third-party and machine payloads, not something a person typed: an
        // inbound email or a track title mentioning such a host is not a probe.
        if ($request->is('api/webhooks/*', 'api/internal/*')) {
            return $next($request);
        }

        $match = $this->signals->findCallbackDomain($request);

        if ($match !== null) {
            $this->signals->callbackDomainSeen($request, $match[0], $match[1]);
        }

        return $next($request);
    }
}
