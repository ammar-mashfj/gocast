<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\Track;
use App\Services\StationStatusService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;

/**
 * Live audio state for one station, read from its Liquidsoap container.
 *
 * This is the endpoint the dashboard polls: it answers "did my station come
 * up?", "what is playing?", "how far in?", and "what's next?" from the
 * container itself rather than from anything Laravel cached at write time.
 *
 * Two consumers:
 *   • the power button, polling until `state` leaves "starting"
 *   • the broadcast pre-flight, which waits for `ready` before opening the
 *     webcast socket, so the broadcaster's first seconds aren't dropped into
 *     a container that hasn't finished building its audio graph
 */
class StationStatusController extends Controller
{
    use AuthorizesRequests;

    /** How many upcoming tracks the dashboard shows. */
    private const UP_NEXT_LIMIT = 5;

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
                'playlist_length' => $this->playlistLength($station),
                'up_next' => $this->upNext($station, $status),
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
     * The upcoming tracks, derived from our own tracks table rather than from
     * the container.
     *
     * This used to read `autodj.remaining_files()` over /status. That is a
     * method on the source `cross()` fast-forwards during a transition, and the
     * Liquidsoap book (§6.4) says such a source may only be used by one
     * operator "otherwise we will run into synchronization issues" — so polling
     * it every couple of seconds was a standing hazard once crossfade was on.
     *
     * Rotation only. Jingles live in the same table but in their own list,
     * written to a separate playlist Liquidsoap plays on a timer — they are
     * never "next" in the sense this card means, and reading tracks() rather
     * than musicTracks() showed a station whose rotation was empty a queue of
     * its station IDs while it played silence.
     *
     * @return list<array{id: ?string, title: string, artist: ?string}>
     */
    private function upNext(Station $station, ?array $status): array
    {
        $tracks = $station->musicTracks()
            ->orderBy('position')
            ->get(['id', 'title', 'artist'])
            ->values();

        if ($tracks->isEmpty()) {
            return [];
        }

        // Anchor on what the container says is playing. The AutoDJ playlist
        // runs in `mode = "normal"` — top to bottom, looping — so everything
        // after the current row, wrapping at the end, is what plays next.
        $currentIndex = $tracks->search(
            fn (Track $track): bool => $track->title === ($status['title'] ?? null)
                && $track->artist === ($status['artist'] ?? null)
        );

        // Unknown current track (live broadcast, silence bed, or a title the
        // container has not reported yet) — start from the top rather than
        // guessing a position.
        $start = $currentIndex === false ? 0 : $currentIndex + 1;

        $count = $tracks->count();
        $upNext = [];

        for ($offset = 0; $offset < min(self::UP_NEXT_LIMIT, $count); $offset++) {
            /** @var Track $track */
            $track = $tracks[($start + $offset) % $count];

            $upNext[] = [
                'id' => $track->id,
                'title' => $track->title,
                'artist' => $track->artist,
            ];
        }

        return $upNext;
    }

    /** Rotation length — what AutoDJ actually cycles through, jingles excluded. */
    private function playlistLength(Station $station): int
    {
        return $station->musicTracks()->count();
    }
}
