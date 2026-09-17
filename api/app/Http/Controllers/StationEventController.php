<?php

namespace App\Http\Controllers;

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use App\Models\StationEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Illuminate\Validation\Rule;

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
     *
     * The list lives on {@see StationEvent} because both this endpoint and the
     * admin timeline filter need it, and two copies of a container's
     * vocabulary would drift the first time one is extended. Two of them carry
     * state beyond a cache entry: `live_connected` and `live_disconnected` are
     * harbor's on_connect/on_disconnect, and they open and close the
     * StreamSession that makes a station read as live. They replaced MediaMTX's
     * runOnReady/runOnNotReady webhooks.
     */
    private const EVENTS = StationEvent::CONTAINER_TYPES;

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
            // Sent only with `live_connected`, and only by a container
            // rendered from the current template. Both are OPTIONAL and both
            // default to the browser studio, which is what every container
            // that has not been relaunched yet is implicitly reporting — see
            // openSession().
            //
            // `client` is the broadcaster's user-agent, allowlisted inside the
            // .liq. Everything else harbor saw, including the Authorization
            // header carrying the station's stream key, is dropped there and
            // never reaches this request.
            'client' => ['sometimes', 'nullable', 'string', 'max:255'],
            'via' => ['sometimes', 'nullable', Rule::in(['browser', 'external'])],
        ]);

        // A client that sends no User-Agent arrives here as "", not as a
        // missing key: `live_header` in the .liq resolves an absent header to
        // default="", and `nullable` accepts the empty string it produces. Left
        // alone, "" survives every `?? null` downstream and reaches the copy
        // that names the broadcaster — "Disconnect  to take it off air."
        // Collapse it to null once, here, so that null is the only way the rest
        // of the app can be told "we don't know what this is".
        $validated['client'] = trim($validated['client'] ?? '') ?: null;

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

        // The cache entry above answers "what is this station doing right
        // now?" and forgets within the hour. This answers "what did it do last
        // night?", which is the question every support conversation actually
        // opens with. Same fast path, same non-load-bearing contract: the
        // recorder swallows its own failures, so a full disk costs a gap in a
        // timeline and never a dropped lifecycle event.
        StationEvent::record(
            $station,
            $validated['event'],
            StationEvent::SOURCE_CONTAINER,
            // Only `live_connected` carries these, and only from a relaunched
            // container. array_filter drops the nulls so an event from an
            // older container records exactly what it always did.
            array_filter([
                'via' => $validated['via'] ?? null,
                'client' => $validated['client'] ?? null,
            ]),
        );

        // icecast_connected is the moment listeners can hear this station —
        // the earliest honest answer to "did the start work?", and far ahead of
        // the next status poll.
        if ($validated['event'] === 'icecast_connected') {
            $station->forceFill(['last_ready_at' => now()])->save();
        }

        if ($validated['event'] === 'live_connected') {
            $this->openSession(
                $station,
                $validated['via'] ?? 'browser',
                $validated['client'] ?? null,
            );
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
    private function openSession(Station $station, string $via, ?string $client): void
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
            return;
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
