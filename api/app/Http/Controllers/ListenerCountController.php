<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\ListenerAnalytics;
use App\Services\StationStatusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Redis;

/**
 * Public endpoint returning real-time listener count and now-playing info.
 *
 * This is what the player polls while it is open, so unlike StationResource it
 * pays for the authoritative answer: it asks the station's container what is
 * actually happening rather than inferring it from owner intent. The cost is
 * one HTTP call per station, already collapsed by StationStatusService's short
 * TTL cache, and it is only ever one station.
 */
class ListenerCountController extends Controller
{
    public function show(
        string $slug,
        StationStatusService $statusService,
        ListenerAnalytics $analytics,
    ): JsonResponse {
        $station = Station::where('slug', $slug)->firstOrFail();

        // Both transports, added together. HLS listeners are the ones whose
        // players have checked in within the live window — a real-time figure,
        // recomputed on every read. Icecast listeners come from the Redis key
        // `stations:sync-listeners` refreshes once a minute, so that half of
        // the total still moves in minute-sized steps and always will: Icecast
        // is polled, not pushed.
        $count = $analytics->liveCount($station);
        $metadata = json_decode(Redis::get("metadata:{$station->id}") ?: '{}', true);

        // The container is the authority on all three of these. `state` folds
        // in intent, so a stopped station reads 'offline' without a socket
        // being opened, and a station whose Icecast connection has dropped
        // reads 'degraded' rather than pretending to be audible.
        $status = $statusService->fetch($station);
        $state = $statusService->state($station, $status);

        // Harbor's own title/artist beats the Redis copy when the container is
        // reachable — the copy is a push that can be missed, this is a read.
        if ($status !== null && ($status['title'] !== null || $status['artist'] !== null)) {
            $metadata = ['title' => $status['title'], 'artist' => $status['artist']];
        }

        return response()->json(['data' => [
            'count' => $count,
            'state' => $state,
            'is_live' => $state === StationStatusService::STATE_LIVE,
            // True whenever a listener who presses play will get audio —
            // including a station rotating untagged files or sitting on
            // silence. 'degraded' is excluded: the graph is fine but Icecast
            // is not carrying it, so there is nothing to connect to.
            'is_on_air' => in_array(
                $state,
                [StationStatusService::STATE_ON_AIR, StationStatusService::STATE_LIVE],
                true,
            ),
            'now_playing' => [
                'title' => $metadata['title'] ?? null,
                'artist' => $metadata['artist'] ?? null,
            ],
            // This run is on the relay path: there is no HLS stream, only the
            // Icecast mount. Here as well as in StationResource::hls_url
            // because a player page outlives the run it was rendered for —
            // the station can go live on the relay after the page loaded.
            //
            // A known leak, accepted: the relay path is Free-only today, so
            // this (like the empty hls_url) tells anyone which plan a station
            // is on while it broadcasts. Any signal that sends the player to
            // the right stream says as much; hiding it would mean every Free
            // listener tries HLS first and starts late.
            'icecast_only' => $station->usesRelay(),
            // The owner's intent, for a player deciding whether to stop. Not
            // `state`: a running station reads 'offline' for the moment its
            // container is gone between a recreate's stop and start, and its
            // listeners are on /standby waiting for it.
            'switched_off' => ! $station->isRunning(),
        ]]);
    }
}
