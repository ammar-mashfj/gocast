<?php

namespace App\Http\Controllers;

use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Services\AutoDjProgramme;
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
 *   • the broadcast pre-flight, which waits for `ready` before opening the
 *     webcast socket, so the broadcaster's first seconds aren't dropped into
 *     a container that hasn't finished building its audio graph
 */
class StationStatusController extends Controller
{
    use AuthorizesRequests;

    /** How many upcoming tracks the dashboard shows. */
    private const UP_NEXT_LIMIT = 5;

    public function __invoke(Station $station, StationStatusService $statusService, AutoDjProgramme $programme): JsonResponse
    {
        $this->authorize('view', $station);

        $status = $statusService->fetch($station);

        // The playlist AutoDJ is drawing from right now — a slot's, or the
        // default — resolved once per poll and shared by the count and the
        // queue below. Eager-loaded for the same reason NextTrackController
        // does it: this endpoint is polled every few seconds per open
        // dashboard, and resolve() reads the slots and the default as
        // relations.
        $station->load(['autodjSlots.playlist', 'defaultPlaylist']);
        $playlist = $programme->resolve($station)['playlist'];

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
                // IS SOMEBODY ON AIR. This is the field the dashboard renders
                // its live/AutoDJ/off answer from, and `source` below is not:
                // `broadcaster` flips the instant harbor accepts the
                // connection, while `source` cannot say "live" until the live
                // arm's 2s buffer has filled, and it describes which arm is
                // feeding the encoder rather than who is here.
                //
                // Null on a container that predates the field — unknown, never
                // "nobody". Consumers fall back to `live_source` below, or to
                // `source === 'live'`, which is the same answer two seconds
                // later.
                //
                // `state` above is NOT derived from this: its `live` vs
                // `on_air` split still follows `source`, because it describes
                // what listeners hear. Identity comes from here, routing from
                // there.
                'broadcaster' => $status['broadcaster'] ?? null,
                // WHO is broadcasting, when someone is — read from the open
                // StreamSession rather than from the container, because the
                // container knows a source is attached and nothing else.
                //
                // Until external ingest shipped this could not be answered at
                // all: every session was opened with a hardcoded
                // source_type of 'browser', so the power badge had to say
                // "Live from another source" and mean "this browser, another
                // browser, or an encoder — we cannot tell".
                'live_source' => $this->liveSource($station),
                'now_playing' => $this->nowPlaying($status),
                'elapsed' => $status['elapsed'] ?? null,
                'remaining' => $status['remaining'] ?? null,
                'playlist_length' => $this->playlistLength($playlist),
                'up_next' => $this->upNext($playlist, $status),
            ],
        ]);
    }

    /**
     * The open broadcast session, if there is one.
     *
     * `client` is the broadcaster's software as harbor saw it, and is null far
     * more often than not — the studio's own session row carries none, and
     * neither does a container that has not been relaunched since the template
     * started reporting it. Nothing may depend on it being there.
     *
     * @return array{type: string, client: ?string}|null
     */
    private function liveSource(Station $station): ?array
    {
        $session = $station->streamSessions()
            ->whereNull('ended_at')
            ->latest('started_at')
            ->first(['source_type', 'client']);

        if ($session === null) {
            return null;
        }

        return [
            'type' => $session->source_type,
            'client' => $session->client,
        ];
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
     * The playlist the programme resolved to, walked the way AutoDjScheduler
     * walks it. Not the library: a track that is in no playlist never plays,
     * and jingles live in their own list written to a separate source
     * Liquidsoap plays on a timer — neither is ever "next" in the sense this
     * card means.
     *
     * @param  array<string, mixed>|null  $status
     * @return list<array{id: ?string, title: string, artist: ?string}>
     */
    private function upNext(?Playlist $playlist, ?array $status): array
    {
        if ($playlist === null) {
            return [];
        }

        $tracks = $playlist->tracks()
            ->get(['tracks.id', 'tracks.title', 'tracks.artist'])
            ->values();

        if ($tracks->isEmpty()) {
            return [];
        }

        if ($playlist->order === Playlist::ORDER_SHUFFLE) {
            return $this->upNextShuffled($playlist, $tracks);
        }

        // Anchor on what the container says is playing. Sequential order runs
        // top to bottom, looping — so everything after the current row,
        // wrapping at the end, is what plays next.
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

            $upNext[] = $this->queueEntry($track);
        }

        return $upNext;
    }

    /**
     * A shuffled playlist's queue is the head of its deck: the scheduler pops
     * the track it hands out, so what remains is, in order, what airs next.
     * IDs of tracks since removed are skipped exactly as the scheduler skips
     * them. No deck (nothing has played since the mode was set, or the last
     * one just ran out) means the next deal has not happened yet, and an
     * empty list is more honest than a guess at a permutation.
     *
     * @param  Collection<int, Track>  $tracks
     * @return list<array{id: ?string, title: string, artist: ?string}>
     */
    private function upNextShuffled(Playlist $playlist, $tracks): array
    {
        $byId = $tracks->keyBy('id');
        $upNext = [];

        foreach ($playlist->deck ?? [] as $id) {
            $track = $byId->get($id);
            if ($track === null) {
                continue;
            }

            $upNext[] = $this->queueEntry($track);

            if (count($upNext) === self::UP_NEXT_LIMIT) {
                break;
            }
        }

        return $upNext;
    }

    /** @return array{id: ?string, title: string, artist: ?string} */
    private function queueEntry(Track $track): array
    {
        return [
            'id' => $track->id,
            'title' => $track->title,
            'artist' => $track->artist,
        ];
    }

    /** Length of the playlist on air now — what AutoDJ actually cycles through, jingles excluded. */
    private function playlistLength(?Playlist $playlist): int
    {
        return $playlist?->tracks()->count() ?? 0;
    }
}
