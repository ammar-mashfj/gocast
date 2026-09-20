<?php

namespace App\Services;

use App\Jobs\AnalyzeTrack;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\Track;
use getID3;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;

/**
 * Persists an uploaded audio file into a station's AutoDJ library:
 *   - validates per-station storage cap
 *   - writes the file to disk under {playlist_dir}/{slug}/{id}.{ext}
 *   - reads ID3/M4A/Vorbis tags via getID3 (filename fallback)
 *   - creates the Track row at position max+1 *within its kind*
 *   - regenerates the station's jingle m3u
 *
 * Music and jingles share this path entirely — same storage cap, same
 * directory, same tag read, same quota lock. `kind` only decides which
 * position sequence the file joins and how it reaches Liquidsoap (the
 * rotation query, or `jingles.m3u`), which is what makes jingles nearly free
 * to support: there is no second upload pipeline to keep in step with this
 * one.
 *
 * Caller is responsible for authorization. Throws on quota exceeded and on
 * write failure; rolls back the on-disk file if the DB insert blows up.
 */
class TrackImporter
{
    public function __construct(
        private readonly PlaylistFileWriter $playlistWriter,
        private readonly PlaylistTracks $playlistTracks,
    ) {}

    /**
     * Reject the upload if the station's existing usage + this file would
     * exceed the per-station storage cap.
     */
    public function ensureWithinQuota(Station $station, int $incomingBytes): void
    {
        $cap = (int) config('liquidsoap.station_storage_bytes');
        $current = (int) $station->tracks()->sum('file_size_bytes');

        if ($current + $incomingBytes > $cap) {
            throw new RuntimeException(sprintf(
                'Station storage limit reached (%s used of %s).',
                $this->humanBytes($current),
                $this->humanBytes($cap),
            ));
        }
    }

    /**
     * Import one uploaded file. Returns the persisted Track.
     *
     * Quota check + write + DB insert run inside a transaction with a
     * row-level lock on the station, so two concurrent uploads can't both
     * pass the quota check and write past the storage cap. The on-disk
     * file is rolled back if anything inside the transaction throws.
     *
     * `$kind` picks which list the file joins — Track::KIND_MUSIC (the
     * rotation) or Track::KIND_JINGLE (station IDs). Jingles count against
     * the same per-station storage cap: they are usually seconds long, and a
     * second quota would be two numbers to explain in the UI for no benefit.
     *
     * A music track also joins a playlist — `$playlist` if given, else the
     * station's default — because a track in no playlist never plays, and
     * "upload it and it plays" is the promise the library page makes.
     */
    public function import(Station $station, UploadedFile $file, string $kind = Track::KIND_MUSIC, ?Playlist $playlist = null): Track
    {
        $size = $file->getSize();
        if ($size === false) {
            throw new RuntimeException('Could not determine uploaded file size.');
        }
        $size = (int) $size;

        $dir = $this->playlistWriter->stationDir($station);
        File::ensureDirectoryExists($dir);
        // Liquidsoap container runs as UID 100; the api container creates
        // these dirs as root. Without explicit perms LS can't read the file.
        @chmod($dir, 0777);

        $extension = strtolower($file->getClientOriginalExtension() ?: 'mp3');
        $originalName = (string) $file->getClientOriginalName();

        $track = (new Track)->forceFill([
            'station_id' => $station->id,
            'kind' => $kind,
            'original_filename' => $originalName,
            'file_size_bytes' => $size,
        ]);
        $track->setAttribute($track->getKeyName(), (string) $track->newUniqueId());
        $relativePath = $track->getKey().'.'.$extension;
        $absolutePath = $dir.'/'.$relativePath;

        DB::transaction(function () use ($station, $file, $size, $absolutePath, $dir, $relativePath, $originalName, $track, $kind, $playlist) {
            // Lock the station row so two concurrent uploads serialize and
            // each sees the other's incremented total in the quota check.
            Station::whereKey($station->id)->lockForUpdate()->first();
            $this->ensureWithinQuota($station, $size);

            try {
                $file->move($dir, $relativePath);
                @chmod($absolutePath, 0644);

                $tags = $this->readTags($absolutePath);
                [$derivedArtist, $derivedTitle] = $this->splitArtistTitle($originalName);

                $track->forceFill([
                    'path' => $relativePath,
                    'title' => $tags['title'] ?: ($derivedTitle ?: $this->titleFromFilename($originalName)),
                    'artist' => $tags['artist'] ?: $derivedArtist,
                    'duration_seconds' => (float) ($tags['duration'] ?? 0),
                    'position' => $this->nextPosition($station, $kind),
                ]);
                $track->save();

                // Inside the transaction so a track can never be committed
                // without its playlist membership.
                if ($kind === Track::KIND_MUSIC) {
                    $destination = $playlist ?? $station->defaultPlaylist;
                    if ($destination !== null) {
                        $this->playlistTracks->attach($destination, [$track->getKey()]);
                    }
                }
            } catch (\Throwable $e) {
                // Don't leave an orphan on disk if any step fails after move().
                if (is_file($absolutePath)) {
                    @unlink($absolutePath);
                }
                throw $e;
            }
        });

        // Playlist regeneration runs outside the transaction so a slow disk
        // doesn't extend the lock window.
        $this->playlistWriter->write($station);
        $this->playlistWriter->reload($station);

        // Loudness and cue points, measured on the queue. Deliberately after
        // the commit and outside the transaction: the job looks the track up
        // by id, and a worker fast enough to beat the commit would find
        // nothing. Deliberately not awaited either — it decodes the whole
        // file, and an upload must not wait on that. The track is playable
        // immediately and simply plays uncorrected until the job lands.
        if (config('liquidsoap.analysis_enabled', true)) {
            AnalyzeTrack::dispatch($track->getKey());
        }

        // After the commit, so a rolled-back upload leaves no trace of having
        // happened. The title is copied onto the event rather than referenced
        // by id, because the point of a log entry is that it still reads
        // correctly once the track it describes has been deleted.
        StationEvent::record($station, StationEvent::TYPE_TRACK_UPLOADED, properties: [
            'track_id' => $track->getKey(),
            'kind' => $kind,
            'title' => $track->title,
            'artist' => $track->artist,
            'bytes' => $size,
        ]);

        return $track;
    }

    /**
     * Permanently remove a track: delete the on-disk file, remove the row,
     * compact remaining positions, and regenerate the playlist file.
     */
    public function destroy(Track $track): void
    {
        $station = $track->station;
        if ($station === null) {
            throw new ModelNotFoundException('Track has no station.');
        }

        $absolute = $this->playlistWriter->stationDir($station).'/'.$track->path;
        if (is_file($absolute)) {
            @unlink($absolute);
        }

        $deletedPosition = $track->position;
        $deletedKind = $track->kind;

        // Read off the model before it is deleted — afterwards these are the
        // only surviving record of what the file was.
        $deletedDetails = [
            'track_id' => $track->getKey(),
            'kind' => $deletedKind,
            'title' => $track->title,
            'artist' => $track->artist,
            'bytes' => $track->file_size_bytes,
        ];

        // Before the row goes: the FK cascade would drop the pivot rows on
        // its own, but only this renumbers what each playlist has left.
        $this->playlistTracks->detachEverywhere($track);

        $track->delete();

        // Compact: every later track shifts down by one. Keeps positions
        // gap-free so a future "play track #N" feature is unambiguous.
        // Scoped to the same kind — the two lists number independently, so
        // deleting a jingle must not renumber the rotation.
        Track::where('station_id', $station->id)
            ->where('kind', $deletedKind)
            ->where('position', '>', $deletedPosition)
            ->decrement('position');

        $this->playlistWriter->write($station);
        $this->playlistWriter->reload($station);

        StationEvent::record($station, StationEvent::TYPE_TRACK_DELETED, properties: $deletedDetails);
    }

    /**
     * Delete several of a station's tracks in one pass. Returns how many rows
     * were actually removed; IDs that are not this station's are ignored
     * rather than failing the batch.
     *
     * NOT a loop over destroy(), and the difference is the point. destroy()
     * rewrites the playlist file and reloads Liquidsoap every time, so twenty
     * single deletes are twenty reloads of a station that may be on air. Here
     * the whole batch shares one write and one reload.
     *
     * Order matters. The database work runs inside a transaction and the files
     * are unlinked only once it has committed — a rolled-back batch that had
     * already deleted the audio would leave rows pointing at nothing, which is
     * the one outcome worse than an orphaned file on disk.
     *
     * @param  list<string>  $trackIds
     */
    public function destroyMany(Station $station, array $trackIds): int
    {
        $tracks = $station->tracks()->whereKey($trackIds)->get();
        if ($tracks->isEmpty()) {
            return 0;
        }

        $stationDir = $this->playlistWriter->stationDir($station);

        // Read everything off the models while they still exist; afterwards
        // these arrays are the only record of what the files were.
        $paths = [];
        $events = [];
        $kinds = [];
        foreach ($tracks as $track) {
            $paths[] = $stationDir.'/'.$track->path;
            $kinds[$track->kind] = true;
            $events[] = [
                'track_id' => $track->getKey(),
                'kind' => $track->kind,
                'title' => $track->title,
                'artist' => $track->artist,
                'bytes' => $track->file_size_bytes,
            ];
        }

        DB::transaction(function () use ($tracks, $station, $kinds) {
            // The FK cascade would drop the pivot rows on its own, but only
            // this renumbers what each playlist has left.
            foreach ($tracks as $track) {
                $this->playlistTracks->detachEverywhere($track);
            }

            Track::query()->whereKey($tracks->modelKeys())->delete();

            // One compaction per affected kind, instead of destroy()'s
            // decrement-per-deletion. The two lists number independently.
            foreach (array_keys($kinds) as $kind) {
                $this->resequence($station, (string) $kind);
            }
        });

        foreach ($paths as $absolute) {
            if (is_file($absolute)) {
                @unlink($absolute);
            }
        }

        $this->playlistWriter->write($station);
        $this->playlistWriter->reload($station);

        // One event per file, the same as deleting them one at a time would
        // have produced — the admin timeline should not lose detail just
        // because the owner used the checkbox.
        foreach ($events as $details) {
            StationEvent::record($station, StationEvent::TYPE_TRACK_DELETED, properties: $details);
        }

        return $tracks->count();
    }

    /**
     * Close the gaps in one kind's `position` sequence, leaving it 1-based and
     * contiguous in its existing order.
     *
     * Only rows whose position actually moves are written, so deleting from
     * the tail of a large library costs almost nothing.
     */
    private function resequence(Station $station, string $kind): void
    {
        $rows = $station->tracks()
            ->where('kind', $kind)
            ->orderBy('position')
            ->orderBy('id')
            ->lockForUpdate()
            ->get(['id', 'position']);

        $position = 0;
        foreach ($rows as $row) {
            $position++;
            if ((int) $row->position === $position) {
                continue;
            }
            Track::query()->whereKey($row->id)->update(['position' => $position]);
        }
    }

    /**
     * Reorder a station's tracks within one kind. `$idsInOrder` is the
     * desired sequence; any tracks of that kind not present are preserved at
     * the tail in their existing relative order. Idempotent.
     *
     * Scoped to a kind because the two lists carry independent position
     * sequences — reordering the rotation over the full track set would
     * renumber jingles into the middle of it.
     */
    public function reorder(Station $station, array $idsInOrder, string $kind = Track::KIND_MUSIC): void
    {
        DB::transaction(function () use ($station, $idsInOrder, $kind) {
            $tracks = $station->tracks()->where('kind', $kind)->lockForUpdate()->get()->keyBy('id');

            $position = 1;
            $touched = [];
            foreach ($idsInOrder as $id) {
                $track = $tracks->get((string) $id);
                if ($track === null) {
                    continue;
                }
                if ($track->position !== $position) {
                    $track->forceFill(['position' => $position])->save();
                }
                $touched[(string) $id] = true;
                $position++;
            }

            foreach ($tracks as $id => $track) {
                if (isset($touched[(string) $id])) {
                    continue;
                }
                if ($track->position !== $position) {
                    $track->forceFill(['position' => $position])->save();
                }
                $position++;
            }
        });

        $this->playlistWriter->write($station);
        $this->playlistWriter->reload($station);
    }

    /**
     * Best-effort tag read. Returns ['title' => ?, 'artist' => ?, 'duration' => ?].
     * Failures are swallowed — caller falls back to filename-derived title.
     */
    private function readTags(string $absolutePath): array
    {
        $out = ['title' => null, 'artist' => null, 'duration' => null];

        if (! class_exists(getID3::class)) {
            return $out;
        }

        try {
            $info = (new getID3)->analyze($absolutePath);
        } catch (\Throwable) {
            return $out;
        }

        // getID3 normalizes tags from id3v2/id3v1/quicktime/vorbiscomment
        // into the `tags_html` and `comments` keys; `comments` is the
        // best source because it's already merged across formats.
        $comments = $info['comments'] ?? [];
        $title = $comments['title'][0] ?? null;
        $artist = $comments['artist'][0] ?? null;
        $duration = $info['playtime_seconds'] ?? null;

        return [
            'title' => is_string($title) ? trim($title) : null,
            'artist' => is_string($artist) ? trim($artist) : null,
            'duration' => is_numeric($duration) ? (float) $duration : null,
        ];
    }

    private function titleFromFilename(string $filename): string
    {
        $stem = pathinfo($filename, PATHINFO_FILENAME);

        return $stem !== '' ? $stem : 'Untitled';
    }

    /**
     * Best-effort "Artist - Title.mp3" filename split. Returns
     * [artist, title] when the stem contains exactly one " - " (the common
     * convention), otherwise [null, null]. Used only when ID3 didn't yield
     * an artist — so it never overrides real tags.
     *
     * @return array{0: ?string, 1: ?string}
     */
    private function splitArtistTitle(string $filename): array
    {
        $stem = pathinfo($filename, PATHINFO_FILENAME);
        if ($stem === '') {
            return [null, null];
        }

        $parts = explode(' - ', $stem);
        // Only split when there's an unambiguous single separator. Filenames
        // with multiple " - " (the Arabic track's "title-only" form) get
        // left alone — the whole stem becomes the title.
        if (count($parts) !== 2) {
            return [null, null];
        }

        $artist = trim($parts[0]);
        $title = trim($parts[1]);
        if ($artist === '' || $title === '') {
            return [null, null];
        }

        return [$artist, $title];
    }

    private function nextPosition(Station $station, string $kind): int
    {
        return ((int) $station->tracks()->where('kind', $kind)->max('position')) + 1;
    }

    private function humanBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        $value = (float) $bytes;
        while ($value >= 1024 && $i < count($units) - 1) {
            $value /= 1024;
            $i++;
        }

        return number_format($value, $value < 10 ? 1 : 0).' '.$units[$i];
    }
}
