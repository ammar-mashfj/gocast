<?php

namespace App\Services;

use App\Events\StationStateChanged;
use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use App\Models\StationEvent;
use Illuminate\Contracts\Cache\Lock;
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
    /**
     * A relay broadcaster back within this long of leaving rejoins the
     * session it left. A relay restart reconnects every studio, and that is
     * one show, not two: two rows would split its airtime and analytics and
     * send "now live" again. Relay only: on a container station a second DJ
     * can take over within seconds, and that is a new show.
     */
    public const REJOIN_SECONDS = 30;

    public function __construct(
        private readonly BroadcastOrigin $origin,
        private readonly StationStatusService $statusService,
        private readonly IcecastAdmin $icecast,
    ) {}

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
     * $whileRelayRuns is for a caller acting on an older reading (the
     * reconcile's mount list): inside the lock the station is re-read and
     * Icecast asked again, and nothing opens on a station turned off or moved
     * off the relay since, or on a show that has ended since. Stops and
     * disconnects close under the same lock, so neither can slip in between.
     *
     * @return bool Whether a new session was opened.
     */
    public function open(Station $station, string $via, ?string $client, bool $whileRelayRuns = false, ?string $studio = null): bool
    {
        try {
            return self::lock($station)->block(5, function () use ($station, $via, $client, $whileRelayRuns, $studio) {
                if ($whileRelayRuns) {
                    $fresh = Station::find($station->id);

                    if ($fresh === null || ! $fresh->isRunning() || ! $fresh->usesRelay()
                        || $this->icecast->carries($fresh->icecast_mount) !== true) {
                        return false;
                    }

                    // The rejoin reads this run's start and path: the copy
                    // read inside the lock, not the caller's older one.
                    $station = $fresh;
                }

                return $this->openUnlocked($station, $via, $client, $studio);
            });
        } catch (LockTimeoutException) {
            // Whoever holds the lock is opening this very session. Throwing
            // would answer Icecast's one-shot callback with a 500, or end a
            // reconcile pass for every other station.
            Log::warning('Session open waited out another open of the same station', ['station' => $station->slug]);

            return false;
        }
    }

    /**
     * The one per-station lock every open and close of a session row takes,
     * the stop included.
     */
    public static function lock(Station $station): Lock
    {
        return Cache::lock("stream-session-open:{$station->id}", 10);
    }

    /**
     * $studio is the relay studio's own id (RelaySourceHolder), when known:
     * its token request's origin is the one that belongs to this source.
     */
    private function openUnlocked(Station $station, string $via, ?string $client, ?string $studio = null): bool
    {
        // The origin only exists for the studio and the app, which ask for a
        // broadcast token first. An encoder never does, so its row gets no IP.
        //
        // On the relay, only the origin of the studio that holds this source:
        // without its id (a tab from before studio ids, a lost login record,
        // a reconcile that cannot confirm the holder) the device is unknown,
        // and the latest token request is no stand-in — it is as likely to be
        // a second device that was refused "already live". A container's
        // harbor reports the device itself; its IP still comes from the
        // station's latest token request, as it always has.
        $origin = match (true) {
            $via === 'external' => [],
            $station->usesRelay() => $studio !== null ? $this->origin->for($station, $studio) : [],
            default => $this->origin->for($station),
        };
        // Harbor reports the device itself; Icecast (the relay path) and a
        // container from before harbor reported it cannot, so the token
        // request's User-Agent stands in. Never for an encoder, whose
        // connection did not come from the device that asked for a token.
        $client ??= $via === 'browser' ? ($origin['client'] ?? null) : null;

        $existing = $station->streamSessions()->whereNull('ended_at')->latest('started_at')->first();

        // A relay source whose studio is known joins the open row as that
        // studio: a device that took the show over while the row stayed open
        // (its disconnect was answered by the new source already on air) is
        // the device on air now.
        if ($existing !== null && $studio !== null && $station->usesRelay()) {
            $existing->update(array_filter([
                'client' => $client,
                'ip_address' => $origin['ip_address'] ?? null,
                'country' => $origin['country'] ?? null,
            ], fn ($value) => $value !== null));
        }

        if ($existing !== null) {
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

        if ($this->rejoinRecentSession($station, $via, $client, $origin)) {
            return true;
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
     * Reopen this run's session if the same kind of broadcaster closed it
     * moments ago. True still counts as opened: the disconnect was announced,
     * so the dashboard must hear the station is live again.
     */
    /**
     * The rejoined row takes the device and origin of the source that rejoins
     * it, when known: a phone that took over from a laptop is the phone.
     * Unknown values change nothing, so a rejoin whose studio is unknown
     * keeps the row's device and IP as they were.
     *
     * @param  array{ip_address?: ?string, country?: ?string, client?: ?string}  $origin
     */
    private function rejoinRecentSession(Station $station, string $via, ?string $client, array $origin): bool
    {
        $last = $station->streamSessions()->latest('started_at')->first();

        if (! $station->usesRelay()
            || $last === null
            || $last->ended_at === null
            // Only a session a disconnect closed. One reconcile closed as
            // stranded has been dead for minutes, and rejoining it would
            // count that gap as airtime.
            || Cache::get(self::rejoinKey($station)) !== $last->id
            || $last->source_type !== $via
            || $last->ended_at->lt(now()->subSeconds(self::REJOIN_SECONDS))
            // A session from before this power-on belongs to another run.
            || ($station->started_at !== null && $last->started_at->lt($station->started_at))) {
            return false;
        }

        $last->update(array_filter([
            'ended_at' => null,
            'client' => $client,
            'ip_address' => $origin['ip_address'] ?? null,
            'country' => $origin['country'] ?? null,
        ], fn ($value, $key) => $key === 'ended_at' || $value !== null, ARRAY_FILTER_USE_BOTH));
        Cache::forget(self::rejoinKey($station));

        return true;
    }

    /**
     * Tell everyone who shows live-ness that a session really opened or
     * closed: the cached status goes (the relay status is built from the
     * session row), the admin timeline gets the event, and the dashboard is
     * told to refetch. Only after open() or close() said something changed.
     *
     * @param  array<string, mixed>  $context
     */
    public function announce(Station $station, string $type, array $context): void
    {
        // The device on the timeline, as a container's live_connected records
        // it: the open session holds what open() resolved.
        if ($type === StationEvent::TYPE_LIVE_CONNECTED && ! array_key_exists('client', $context)) {
            $client = $station->streamSessions()->whereNull('ended_at')->latest('started_at')->value('client');

            if ($client !== null) {
                $context['client'] = $client;
            }
        }

        $this->statusService->forget($station);
        StationEvent::record($station, $type, StationEvent::SOURCE_SYSTEM, $context);
        event(StationStateChanged::for($station, $type));
    }

    /**
     * Close any open session and drop the now-playing payload, so the
     * listener-facing API stops showing the last broadcaster track instead of
     * waiting out its TTL.
     *
     * Under the open lock, together with $unless: a disconnect asks "is the
     * mount live again?" and closes as one step, so a reconnect's open can
     * land before it or after it, never between the question and the close.
     *
     * $rejoinable is for a broadcaster's own disconnect: the session it
     * closes may be rejoined by a reconnect within REJOIN_SECONDS. Every
     * other close (a stop, a stranded session) is final.
     *
     * @param  (\Closure(): bool)|null  $unless  Keep the session when this says so.
     * @return bool Whether a session was open.
     */
    public function close(Station $station, ?\Closure $unless = null, bool $rejoinable = false): bool
    {
        try {
            return self::lock($station)->block(5, fn () => $this->closeUnlocked($station, $unless, $rejoinable));
        } catch (LockTimeoutException) {
            // A close must not be lost: a session left open reads as live.
            Log::warning('Session close waited out another open of the same station', ['station' => $station->slug]);

            return $this->closeUnlocked($station, $unless, $rejoinable);
        }
    }

    private function closeUnlocked(Station $station, ?\Closure $unless, bool $rejoinable): bool
    {
        if ($unless !== null && $unless()) {
            return false;
        }

        $open = $station->streamSessions()->whereNull('ended_at')->latest('started_at')->value('id');

        $closed = $station->streamSessions()
            ->whereNull('ended_at')
            ->update(['ended_at' => now()]);

        Redis::del("metadata:{$station->id}");

        if ($rejoinable && $open !== null) {
            Cache::put(self::rejoinKey($station), $open, self::REJOIN_SECONDS);
        } else {
            Cache::forget(self::rejoinKey($station));
        }

        return $closed > 0;
    }

    /**
     * A broadcaster's own disconnect closed this station's session moments
     * ago, so a reconnect may still rejoin it: the show is mid-blip, not over.
     */
    public function mayRejoin(Station $station): bool
    {
        return Cache::has(self::rejoinKey($station));
    }

    private static function rejoinKey(Station $station): string
    {
        return "stream-session-rejoin:{$station->id}";
    }
}
