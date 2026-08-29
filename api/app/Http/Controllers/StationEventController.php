<?php

namespace App\Http\Controllers;

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * Lifecycle events pushed by a station's Liquidsoap container.
 *
 * Everything Laravel knew about a container's boot used to be inferred from
 * outside: `docker run` exited 0, so presumably it worked; `/status` answered,
 * so presumably it is up. The container is the only component that knows when
 * it actually came up, and the only one that knows whether Icecast accepted
 * the source — so it says so.
 *
 * These events are a FAST PATH, never a source of truth. A script that fails
 * to parse dies before it can report anything, so silence is ambiguous by
 * construction: it means "booting" or "dead", and only a deadline can tell
 * them apart (LiquidsoapSupervisor verifies the container after start, and
 * `stations:reconcile` keeps polling). Nothing here may be load-bearing for
 * correctness — losing an event must cost freshness, not leave a station
 * stranded. That is the lesson the old `is_live` column taught us by sticking
 * true forever when a MediaMTX webhook went missing — and why live-ness is now
 * derived from an open StreamSession rather than stored.
 *
 * Authenticated by the shared X-Internal-Key (the `internal` middleware), the
 * same as the now-playing push these sit alongside.
 */
class StationEventController extends Controller
{
    /**
     * Events a station may report. Anything else is dropped — the endpoint is
     * reachable by every station container, so the payload is not trusted to
     * name its own cache keys.
     */
    private const EVENTS = [
        'boot',
        'shutdown',
        'icecast_connected',
        'icecast_disconnected',
        'icecast_error',
        'live_silent',
        'live_audio',
        // Harbor's on_connect/on_disconnect. These are the only two that carry
        // state beyond a cache entry: they open and close the StreamSession
        // that makes a station read as live. They replaced MediaMTX's
        // runOnReady/runOnNotReady webhooks.
        'live_connected',
        'live_disconnected',
    ];

    /** Cache key prefix holding the most recent event for a station. */
    public const CACHE_PREFIX = 'station-event:';

    /**
     * How long a reported event stays interesting. Comfortably longer than a
     * reconciler pass so a station that reported once is not treated as silent
     * in between.
     */
    private const TTL_SECONDS = 3600;

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slug' => ['required', 'string', 'max:64'],
            'event' => ['required', 'string', 'max:32'],
        ]);

        if (! in_array($validated['event'], self::EVENTS, true)) {
            return response()->json(['ok' => false, 'error' => 'unknown event'], 422);
        }

        $station = Station::where('slug', $validated['slug'])->first();

        if ($station === null) {
            return response()->json(['ok' => false, 'error' => 'station not found'], 404);
        }

        Cache::put(
            self::CACHE_PREFIX.$station->id,
            ['event' => $validated['event'], 'at' => now()->toIso8601String()],
            self::TTL_SECONDS,
        );

        // icecast_connected is the moment listeners can hear this station —
        // the earliest honest answer to "did the start work?", and far ahead of
        // the next status poll.
        if ($validated['event'] === 'icecast_connected') {
            $station->forceFill(['last_ready_at' => now()])->save();
        }

        if ($validated['event'] === 'live_connected') {
            $this->openSession($station);
        }

        if ($validated['event'] === 'live_disconnected') {
            $this->closeSessions($station);
        }

        Log::info('Station reported a lifecycle event', [
            'station' => $station->slug,
            'event' => $validated['event'],
        ]);

        return response()->json(['ok' => true]);
    }

    /**
     * Open the StreamSession that makes this station read as live.
     *
     * Idempotent: harbor can report a connection twice (a broadcaster that
     * reconnects inside the same second, a retried notification), and a second
     * open session would double-count airtime. Reuse whatever is already open.
     */
    private function openSession(Station $station): void
    {
        $existing = $station->streamSessions()->whereNull('ended_at')->exists();

        if ($existing) {
            return;
        }

        $session = $station->streamSessions()->create([
            'started_at' => now(),
            'source_type' => 'browser',
        ]);

        SendStationLiveNotifications::dispatch($station->id, $session->id)
            ->delay(now()->addMinutes(2));
    }

    /**
     * Close any open session and drop the now-playing payload, so the
     * listener-facing API stops showing the last broadcaster track instead of
     * waiting out its TTL.
     */
    private function closeSessions(Station $station): void
    {
        $station->streamSessions()
            ->whereNull('ended_at')
            ->update(['ended_at' => now()]);

        Redis::del("metadata:{$station->id}");
    }
}
