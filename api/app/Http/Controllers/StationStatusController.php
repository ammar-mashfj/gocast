<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\Track;
use App\Services\StationStatusService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

/**
 * Live audio state for one station, read from its Liquidsoap container.
 *
 * This is the endpoint the dashboard polls: it answers "did my station come
 * up?", "what is playing?", "how far in?", and "what's next?" from the
 * container itself rather than from anything Laravel cached at write time.
 *
 * Two consumers:
 *   • the power button, polling until `state` leaves "starting"
 *   • the broadcast pre-flight, which waits for `ready` before publishing
 *     WHIP so the broadcaster's first seconds aren't dropped into a
 *     container that hasn't finished building its audio graph
 */
class StationStatusController extends Controller
{
    use AuthorizesRequests;

    public function __invoke(Station $station, StationStatusService $statusService): JsonResponse
    {
        $this->authorize('view', $station);

        $status = $statusService->fetch($station);

        return response()->json([
            'data' => [
                'slug' => $station->slug,
                'state' => $statusService->state($station, $status),
                'desired_state' => $station->desired_state,
                'started_at' => $station->started_at,
                // Distinguishes "the container answered" from "we're
                // guessing" — the client shows a warning after a station
                // has been unreachable for a while.
                'reachable' => $status !== null,
                'ready' => (bool) ($status['ready'] ?? false),
                // Is Icecast actually carrying this station? `ready` only says
                // the audio graph produces frames — a station can be ready and
                // inaudible. Null means the container did not report it.
                'icecast_connected' => $status['icecast'] ?? null,
                // Last time the container told us listeners could hear it.
                // `started_at` is intent; this is evidence.
                'last_ready_at' => $station->last_ready_at,
                'source' => $status['source'] ?? null,
                'now_playing' => $this->nowPlaying($status),
                'elapsed' => $status['elapsed'] ?? null,
                'remaining' => $status['remaining'] ?? null,
                'playlist_length' => $status['playlist_length'] ?? null,
                'up_next' => $this->upNext($station, $status['up_next'] ?? []),
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>|null  $status
     * @return array{title: ?string, artist: ?string}|null
     */
    private function nowPlaying(?array $status): ?array
    {
        if ($status === null) {
            return null;
        }

        if (($status['title'] ?? null) === null && ($status['artist'] ?? null) === null) {
            return null;
        }

        return [
            'title' => $status['title'] ?? null,
            'artist' => $status['artist'] ?? null,
        ];
    }

    /**
     * Resolve the filenames Liquidsoap reports as upcoming back into Track
     * rows. Tracks are stored as `{ulid}.{ext}`, which is exactly what the
     * m3u carries, so a single lookup keyed on the filename covers the list.
     *
     * A file with no matching row (deleted while queued) still appears, with
     * a null id — the queue is what it is, and silently dropping entries
     * would make the "up next" list disagree with what listeners hear.
     *
     * @param  list<string>  $filenames
     * @return list<array{id: ?string, title: string, artist: ?string}>
     */
    private function upNext(Station $station, array $filenames): array
    {
        if ($filenames === []) {
            return [];
        }

        /** @var Collection<string, Track> $tracks */
        $tracks = $station->tracks()
            ->whereIn('path', $filenames)
            ->get(['id', 'path', 'title', 'artist'])
            ->keyBy('path');

        return array_map(function (string $filename) use ($tracks) {
            $track = $tracks->get($filename);

            return [
                'id' => $track?->id,
                'title' => $track?->title ?? $filename,
                'artist' => $track?->artist,
            ];
        }, $filenames);
    }
}
