<?php

namespace App\Services;

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * Opens and closes the StreamSession that makes a station read as live.
 *
 * Two callers report a broadcaster arriving and leaving, and they must agree
 * on what that means:
 *
 *   • a Liquidsoap container, through harbor's `live_connected` /
 *     `live_disconnected` (StationEventController);
 *   • Icecast itself, through `source-connect` / `source-disconnect`, for a
 *     station on the relay path that has no container (IcecastCallbackController).
 *
 * Moved here from StationEventController unchanged so the second caller could
 * not grow a copy that drifts.
 */
class BroadcastSessions
{
    public function __construct(private readonly BroadcastOrigin $origin) {}

    /**
     * Open the StreamSession that makes this station read as live.
     *
     * Idempotent: harbor can report a connection twice (a broadcaster that
     * reconnects inside the same second, a retried notification), and a second
     * open session would double-count airtime. Reuse whatever is already open.
     *
     * The check and the insert run under a per-station lock: two callers can
     * arrive together (the relay's source-connect and the minute reconcile
     * that reopens a missed one), and both would otherwise see no open row.
     *
     * @return bool Whether a new session was opened.
     */
    public function open(Station $station, string $via, ?string $client): bool
    {
        try {
            return Cache::lock("stream-session-open:{$station->id}", 10)
                ->block(5, fn () => $this->openUnlocked($station, $via, $client));
        } catch (LockTimeoutException) {
            // Whoever holds the lock is opening this very session. Throwing
            // would answer Icecast's one-shot callback with a 500, or end a
            // reconcile pass for every other station.
            Log::warning('Session open waited out another open of the same station', ['station' => $station->slug]);

            return false;
        }
    }

    private function openUnlocked(Station $station, string $via, ?string $client): bool
    {
        $existing = $station->streamSessions()->whereNull('ended_at')->exists();

        if ($existing) {
            // A row is already open, so leave it alone — reopening would
            // double-count airtime for a broadcaster who reconnected.
            //
            // NOT the web studio arriving ahead of harbor: it never calls
            // StreamSessionController::store at all (see getSessionId() in
            // client/lib/broadcast.ts — "Laravel opens the StreamSession from
            // harbor's connect callback"). This event IS how a browser
            // broadcast gets its row, which is why `via` below has to be
            // right rather than merely a fallback. What reaches here is the
            // desktop client, which does POST its own session, and a harbor
            // reconnect inside the same second.
            return false;
        }

        // This is the only path into a session row for an encoder AND for the
        // web studio — neither makes an API call that opens one. So `via` is
        // not a refinement on top of something else that knows: it is the
        // whole of what distinguishes them. While this hardcoded 'browser', as
        // it did until external ingest shipped, every encoder broadcast was
        // labelled "Studio" on the station overview, which is precisely where
        // someone looks to check whether their encoder worked.
        //
        // The default is still 'browser', for containers rendered before the
        // template started reporting `via`. Those keep their old behaviour
        // until `stations:relaunch` recreates them.
        // The origin only exists for the studio and the app, which ask for a
        // broadcast token first. An encoder never does, so its row gets no IP.
        $origin = $via === 'external' ? [] : $this->origin->for($station);

        $session = $station->streamSessions()->create([
            'started_at' => now(),
            'source_type' => $via,
            'client' => $client,
            'ip_address' => $origin['ip_address'] ?? null,
            'country' => $origin['country'] ?? null,
        ]);

        SendStationLiveNotifications::dispatch($station->id, $session->id)
            ->delay(now()->addMinutes(2));

        return true;
    }

    /**
     * Close any open session and drop the now-playing payload, so the
     * listener-facing API stops showing the last broadcaster track instead of
     * waiting out its TTL.
     *
     * @return bool Whether a session was open.
     */
    public function close(Station $station): bool
    {
        $closed = $station->streamSessions()
            ->whereNull('ended_at')
            ->update(['ended_at' => now()]);

        Redis::del("metadata:{$station->id}");

        return $closed > 0;
    }
}
