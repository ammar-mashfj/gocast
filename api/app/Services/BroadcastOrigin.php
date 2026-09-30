<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Carries the broadcaster's IP and country from the token request to the
 * stream session that harbor opens a moment later.
 *
 * The two happen in different requests. The token request comes from the
 * broadcaster's own browser or phone, so it has the real IP. The session is
 * opened by the container's `live_connected` webhook, which only knows what
 * harbor saw, and harbor sees a proxy. So the origin is kept per station in
 * the cache between the two.
 *
 * Admin monitoring only, like station_events: never throws, never blocks a
 * broadcast, and a missing origin just leaves the columns null.
 */
class BroadcastOrigin
{
    private const PREFIX = 'broadcast-origin:';

    /**
     * Long enough to cover a pre-flight that sits open before Go Live and a
     * reconnect that reuses the page. The next token request overwrites it.
     */
    private const TTL_SECONDS = 6 * 3600;

    public function __construct(private readonly GeoResolver $geo) {}

    public function remember(Station $station, Request $request): void
    {
        try {
            Cache::put(self::PREFIX.$station->id, [
                'ip_address' => $request->ip(),
                'country' => $this->geo->country($request),
            ], self::TTL_SECONDS);
        } catch (Throwable $e) {
            Log::warning('Could not remember broadcast origin', [
                'station' => $station->slug,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @return array{ip_address?: ?string, country?: ?string}
     */
    public function for(Station $station): array
    {
        try {
            return Cache::get(self::PREFIX.$station->id) ?? [];
        } catch (Throwable) {
            return [];
        }
    }
}
