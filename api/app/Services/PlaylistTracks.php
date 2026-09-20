<?php

namespace App\Services;

use App\Models\Playlist;
use App\Models\Track;
use Illuminate\Support\Facades\DB;

/**
 * Membership and order of a playlist's tracks.
 *
 * Everything here writes `playlist_track` (and, in shuffle mode, the
 * playlist's deck) and nothing else — in particular never the `stations`
 * row, so none of it can reach StationObserver and restart a container.
 *
 * `position` on the pivot is kept 1-based and gap-free per playlist, with
 * the same compact-on-remove rule TrackImporter applies to `tracks.position`,
 * so "the track at #N" always means one thing.
 *
 * Callers validate ownership and kind (PlaylistTracksRequest); the queries
 * here still go through `$playlist->tracks()` / the station's music tracks
 * so a stray ID from anywhere else is dropped rather than attached.
 */
class PlaylistTracks
{
    public function __construct(private readonly AutoDjScheduler $scheduler) {}

    /**
     * Append tracks at the tail, in the order given. IDs already in the
     * playlist, and IDs that are not this station's music, are ignored.
     *
     * In shuffle mode the new tracks are also dealt into the remaining deck,
     * so an upload airs this cycle rather than after the next deal — on a
     * 200-track library that used to be half a day away.
     *
     * @param  list<string>  $trackIds
     */
    public function attach(Playlist $playlist, array $trackIds): void
    {
        DB::transaction(function () use ($playlist, $trackIds) {
            $this->lock($playlist);

            $current = $this->memberIds($playlist);
            $valid = $this->stationMusicIds($playlist, $trackIds);

            $new = array_values(array_filter($valid, fn (string $id) => ! in_array($id, $current, true)));
            if ($new === []) {
                return;
            }

            $position = $this->maxPosition($playlist);
            $rows = [];
            foreach ($new as $id) {
                $rows[] = [
                    'playlist_id' => $playlist->getKey(),
                    'track_id' => $id,
                    'position' => ++$position,
                ];
            }
            DB::table('playlist_track')->insert($rows);

            $this->scheduler->dealIn($playlist, $new);
        });
    }

    /**
     * Make the playlist consist of exactly these tracks, in this order.
     * Tracks added by this call are dealt into the deck like attach();
     * tracks dropped are skipped lazily by the scheduler, as a deleted track
     * would be.
     *
     * @param  list<string>  $idsInOrder
     */
    public function replace(Playlist $playlist, array $idsInOrder): void
    {
        DB::transaction(function () use ($playlist, $idsInOrder) {
            $this->lock($playlist);

            $current = $this->memberIds($playlist);
            $desired = $this->stationMusicIds($playlist, $idsInOrder);

            DB::table('playlist_track')->where('playlist_id', $playlist->getKey())->delete();

            $rows = [];
            foreach (array_values($desired) as $index => $id) {
                $rows[] = [
                    'playlist_id' => $playlist->getKey(),
                    'track_id' => $id,
                    'position' => $index + 1,
                ];
            }
            if ($rows !== []) {
                DB::table('playlist_track')->insert($rows);
            }

            $added = array_values(array_filter($desired, fn (string $id) => ! in_array($id, $current, true)));
            $this->scheduler->dealIn($playlist, $added);
        });
    }

    /**
     * Take one track out of this playlist. The file and its library row are
     * untouched — that is TrackImporter::destroy's job.
     */
    public function detach(Playlist $playlist, Track $track): void
    {
        DB::transaction(function () use ($playlist, $track) {
            $this->lock($playlist);

            $this->removeMember($playlist->getKey(), $track->getKey());
        });
    }

    /**
     * Take a track out of every playlist it is in, compacting each one.
     *
     * Called before the track row is deleted. The FK cascade would remove
     * the pivot rows on its own, but a cascade cannot renumber what is left,
     * and a gap in `position` is exactly what the sequential cursor cannot
     * cope with.
     */
    public function detachEverywhere(Track $track): void
    {
        DB::transaction(function () use ($track) {
            $playlistIds = DB::table('playlist_track')
                ->where('track_id', $track->getKey())
                ->pluck('playlist_id');

            foreach ($playlistIds as $playlistId) {
                DB::table('playlists')->where('id', $playlistId)->lockForUpdate()->first();
                $this->removeMember((string) $playlistId, $track->getKey());
            }
        });
    }

    /**
     * Reorder the playlist. `$idsInOrder` is the desired sequence; members
     * not present are preserved at the tail in their existing relative
     * order. Idempotent — the same contract as TrackImporter::reorder().
     *
     * @param  list<string>  $idsInOrder
     */
    public function reorder(Playlist $playlist, array $idsInOrder): void
    {
        DB::transaction(function () use ($playlist, $idsInOrder) {
            $this->lock($playlist);

            $current = DB::table('playlist_track')
                ->where('playlist_id', $playlist->getKey())
                ->orderBy('position')
                ->pluck('position', 'track_id');

            $position = 1;
            $touched = [];
            foreach ($idsInOrder as $id) {
                $id = (string) $id;
                if (! $current->has($id)) {
                    continue;
                }
                $this->setPosition($playlist->getKey(), $id, (int) $current[$id], $position);
                $touched[$id] = true;
                $position++;
            }

            foreach ($current as $id => $existing) {
                if (isset($touched[(string) $id])) {
                    continue;
                }
                $this->setPosition($playlist->getKey(), (string) $id, (int) $existing, $position);
                $position++;
            }
        });
    }

    /**
     * Serialise concurrent edits to one playlist. Two appends racing each
     * other would otherwise both read the same max position.
     */
    private function lock(Playlist $playlist): void
    {
        DB::table('playlists')->where('id', $playlist->getKey())->lockForUpdate()->first();
    }

    /** @return list<string> */
    private function memberIds(Playlist $playlist): array
    {
        return DB::table('playlist_track')
            ->where('playlist_id', $playlist->getKey())
            ->orderBy('position')
            ->pluck('track_id')
            ->map(fn ($id) => (string) $id)
            ->all();
    }

    /**
     * The subset of `$ids` that are this station's music tracks, in the
     * order `$ids` gave them, without duplicates.
     *
     * @param  list<string>  $ids
     * @return list<string>
     */
    private function stationMusicIds(Playlist $playlist, array $ids): array
    {
        $ids = array_values(array_unique(array_map('strval', $ids)));
        if ($ids === []) {
            return [];
        }

        $known = Track::query()
            ->where('station_id', $playlist->station_id)
            ->where('kind', Track::KIND_MUSIC)
            ->whereKey($ids)
            ->pluck('id')
            ->map(fn ($id) => (string) $id)
            ->flip();

        return array_values(array_filter($ids, fn (string $id) => $known->has($id)));
    }

    private function maxPosition(Playlist $playlist): int
    {
        return (int) DB::table('playlist_track')
            ->where('playlist_id', $playlist->getKey())
            ->max('position');
    }

    private function removeMember(string $playlistId, string $trackId): void
    {
        $removed = DB::table('playlist_track')
            ->where('playlist_id', $playlistId)
            ->where('track_id', $trackId)
            ->value('position');

        if ($removed === null) {
            return;
        }

        DB::table('playlist_track')
            ->where('playlist_id', $playlistId)
            ->where('track_id', $trackId)
            ->delete();

        DB::table('playlist_track')
            ->where('playlist_id', $playlistId)
            ->where('position', '>', $removed)
            ->decrement('position');
    }

    private function setPosition(string $playlistId, string $trackId, int $from, int $to): void
    {
        if ($from === $to) {
            return;
        }

        DB::table('playlist_track')
            ->where('playlist_id', $playlistId)
            ->where('track_id', $trackId)
            ->update(['position' => $to]);
    }
}
