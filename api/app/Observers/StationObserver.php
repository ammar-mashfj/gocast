<?php

namespace App\Observers;

use App\Models\Station;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistFileWriter;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Drives the lifecycle of per-station Liquidsoap containers from the
 * Station model:
 *
 *  • created   → spawn the container (live silence on Icecast immediately)
 *  • updated   → re-render the .liq (name/genre/desc affect Icecast metadata
 *                block) and restart so Liquidsoap picks up the new config
 *  • deleting  → stop and remove the container (also fires for soft deletes;
 *                listeners stop hearing the station as soon as it's "deleted")
 *  • restored  → bring it back when a soft-deleted station is undeleted
 *
 * The supervisor calls `docker run` synchronously via the docker socket. It
 * returns as soon as the container is *spawned*, not when Liquidsoap is
 * actually emitting audio (~3-5s later). For station create that's fine —
 * the controller response doesn't block on audio readiness.
 *
 * Failures are logged but NOT re-thrown. We don't want a Docker daemon
 * hiccup to cascade-fail the entire HTTP request that created the station.
 * If the container fails to start, the station exists in the DB but produces
 * no audio — recoverable manually via `php artisan station:relaunch {slug}`.
 */
class StationObserver
{
    public function __construct(
        private LiquidsoapSupervisor $supervisor,
        private PlaylistFileWriter $playlistWriter,
    ) {}

    public function created(Station $station): void
    {
        if (LiquidsoapSupervisor::inTestMode()) {
            return;
        }

        // Stamp an empty playlist.m3u so Liquidsoap's `playlist()` source
        // resolves cleanly the first time the container boots — without it
        // we'd see "file not found" warnings until the user uploads a track.
        $this->safely('playlist-init', $station, fn () => $this->playlistWriter->write($station));
        $this->safely('up', $station, fn () => $this->supervisor->up($station));
    }

    /**
     * Columns whose values are baked into the rendered .liq file. Changing
     * any of these requires a Liquidsoap container restart so the new value
     * lands in the Icecast metadata block / output mount / etc.
     *
     * Importantly this excludes `is_live`, `listener_count`, and the
     * timestamps — those flip constantly during a broadcast (every
     * runOnReady / runOnNotReady webhook), and restarting Liquidsoap on each
     * flip would kick every listener off mid-stream.
     */
    private const LIQ_RELEVANT_COLUMNS = [
        'name',
        'slug',
        'description',
        'genre',
        'icecast_mount',
        'icecast_password',
        'artwork_url',
    ];

    public function updated(Station $station): void
    {
        if (! $station->wasChanged(self::LIQ_RELEVANT_COLUMNS)) {
            return;
        }

        if ($station->wasChanged('slug')) {
            $oldSlug = (string) $station->getOriginal('slug');
            $newSlug = $station->slug;

            $this->safely('down-old-slug', $station, fn () => $this->supervisor->downBySlug($oldSlug));

            $this->safely('rename-playlist-dir', $station, function () use ($oldSlug, $newSlug) {
                $playlistsDir = rtrim((string) config('liquidsoap.playlists_dir'), '/');
                $oldPath = $playlistsDir.'/'.$oldSlug;
                $newPath = $playlistsDir.'/'.$newSlug;
                if (is_dir($oldPath) && ! is_dir($newPath)) {
                    try {
                        rename($oldPath, $newPath);
                    } catch (Throwable $e) {
                        Log::warning('StationObserver: playlist dir rename failed', [
                            'from' => $oldPath,
                            'to' => $newPath,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            });
        }

        $this->safely('up', $station, fn () => $this->supervisor->up($station));
    }

    public function deleting(Station $station): void
    {
        $this->safely('down', $station, fn () => $this->supervisor->down($station));
    }

    public function forceDeleted(Station $station): void
    {
        // Hard delete only — wipe the on-disk playlist tree. The `tracks`
        // rows go via FK cascade; this kills the audio files. We deliberately
        // skip this on soft-delete so a restore retains the library.
        $this->safely('playlist-wipe', $station, function () use ($station) {
            $dir = $this->playlistWriter->stationDir($station);
            if (is_dir($dir)) {
                File::deleteDirectory($dir);
            }
        });
    }

    public function restored(Station $station): void
    {
        $this->safely('up', $station, fn () => $this->supervisor->up($station));
    }

    private function safely(string $action, Station $station, callable $fn): void
    {
        try {
            $fn();
        } catch (Throwable $e) {
            Log::error('StationObserver failed', [
                'action' => $action,
                'station' => $station->slug,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
