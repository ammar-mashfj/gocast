<?php

namespace App\Http\Controllers;

use App\Events\StationStateChanged;
use App\Models\Station;
use App\Models\StationEvent;
use App\Services\BroadcastSessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
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
     * `live_silent` and `live_audio` USED to be in this list, reported by the
     * dead-air guard that no longer exists. A container rendered before that
     * guard was removed still posts them; it gets the same 422 as any unknown
     * event, notify() ignores the response, and the container stops sending
     * them the next time it is recreated. Nothing to migrate.
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

    /**
     * The subset worth putting on a socket: events that change what the
     * dashboard draws.
     *
     * Not all seven, because a broadcast nobody can see is cost without
     * benefit — and on Ably's free tier concurrent connections are the scarce
     * resource, so every message we do not send is headroom.
     *
     *   • `boot` is excluded. It fires from on_start, BEFORE the audio graph
     *     is ready, so the station reads as `starting` both before and after
     *     it — there is nothing for a client to redraw. The event that
     *     actually ends the boot is icecast_connected.
     *   • `icecast_error` IS included, though it is easy to miss: the template
     *     sets `ice_up := false` in on_error exactly as it does in
     *     on_disconnect, so it produces the same `degraded` state. Leaving it
     *     out would mean a station that loses its mount to an error rather
     *     than a clean disconnect is the one case that stays stale.
     *
     * @var list<string>
     */
    private const BROADCAST_EVENTS = [
        StationEvent::TYPE_SHUTDOWN,
        StationEvent::TYPE_ICECAST_CONNECTED,
        StationEvent::TYPE_ICECAST_DISCONNECTED,
        StationEvent::TYPE_ICECAST_ERROR,
        StationEvent::TYPE_LIVE_CONNECTED,
        StationEvent::TYPE_LIVE_DISCONNECTED,
    ];

    /** Cache key prefix holding the most recent event for a station. */
    public const CACHE_PREFIX = 'station-event:';

    /**
     * How long a reported event stays interesting. Comfortably longer than a
     * reconciler pass so a station that reported once is not treated as silent
     * in between.
     */
    private const TTL_SECONDS = 3600;

    public function __invoke(Request $request, BroadcastSessions $sessions): JsonResponse
    {
        $validated = $request->validate([
            'slug' => ['required', 'string', 'max:64'],
            'event' => ['required', 'string', 'max:32'],
            // Sent only with `live_connected`, and only by a container
            // rendered from the current template. Both are OPTIONAL and both
            // default to the browser studio, which is what every container
            // that has not been relaunched yet is implicitly reporting — see
            // BroadcastSessions::open().
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
            $sessions->open(
                $station,
                $validated['via'] ?? 'browser',
                $validated['client'] ?? null,
            );
        }

        if ($validated['event'] === 'live_disconnected') {
            $sessions->close($station);
        }

        // LAST, after the side effects above, because the client's response to
        // this is to refetch. A broadcast sent before BroadcastSessions::open() commits
        // would race its own consumer: the dashboard asks
        // GET /stations/{slug}/status, the session row is not there yet, and
        // the answer it caches says nobody is broadcasting — the exact stale
        // state the push exists to prevent, now arriving faster.
        //
        // Queued, NOT ShouldBroadcastNow. This request comes from a Liquidsoap
        // container and is served by a php-fpm pool with pm.max_children = 12
        // (infra/native/php/gocast.pool.conf). Publishing inline would hold a
        // worker for as long as Ably takes to answer, and twelve of those is
        // the whole API — including harbor-auth, which gates ingest. A
        // broadcasting outage must not become an ingest outage.
        //
        // Every event is broadcast, repeats included. Skipping a repeat of the
        // last cached event would also swallow a real change whenever an event
        // in between was lost, and the repeats are cheap now that `realtime`
        // has a worker of its own (gocast-realtime.service).
        if (in_array($validated['event'], self::BROADCAST_EVENTS, true)) {
            event(StationStateChanged::for($station, $validated['event']));
        }

        Log::info('Station reported a lifecycle event', [
            'station' => $station->slug,
            'event' => $validated['event'],
        ]);

        return response()->json(['ok' => true]);
    }
}
