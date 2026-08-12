<?php

namespace App\Services;

use App\Models\Station;
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
 *   - creates the Track row at position max+1
 *   - regenerates the station's playlist.m3u
 *
 * Caller is responsible for authorization. Throws on quota exceeded and on
 * write failure; rolls back the on-disk file if the DB insert blows up.
 */
class TrackImporter
{
    public function __construct(
        private readonly PlaylistFileWriter $playlistWriter,
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
     */
    public function import(Station $station, UploadedFile $file): Track
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
            'original_filename' => $originalName,
            'file_size_bytes' => $size,
        ]);
        $track->setAttribute($track->getKeyName(), (string) $track->newUniqueId());
        $relativePath = $track->getKey().'.'.$extension;
        $absolutePath = $dir.'/'.$relativePath;

        DB::transaction(function () use ($station, $file, $size, $absolutePath, $dir, $relativePath, $originalName, $track) {
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
                    'position' => $this->nextPosition($station),
                ]);
                $track->save();
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
        $track->delete();

        // Compact: every later track shifts down by one. Keeps positions
        // gap-free so a future "play track #N" feature is unambiguous.
        Track::where('station_id', $station->id)
            ->where('position', '>', $deletedPosition)
            ->decrement('position');

        $this->playlistWriter->write($station);
        $this->playlistWriter->reload($station);
    }

    /**
     * Reorder a station's tracks. `$idsInOrder` is the desired sequence;
     * any tracks not present are preserved at the tail in their existing
     * relative order. Idempotent.
     */
    public function reorder(Station $station, array $idsInOrder): void
    {
        DB::transaction(function () use ($station, $idsInOrder) {
            $tracks = $station->tracks()->lockForUpdate()->get()->keyBy('id');

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

    private function nextPosition(Station $station): int
    {
        return ((int) $station->tracks()->max('position')) + 1;
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
