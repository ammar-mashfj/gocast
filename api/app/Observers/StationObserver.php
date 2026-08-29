<?php

namespace App\Observers;

use App\Models\Station;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistFileWriter;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Keeps a RUNNING station's container in step with its configuration.
 *
 * This observer used to own the whole container lifecycle, spawning one on
 * `created`. It no longer does: starting a station is an explicit act by its
 * owner (StationLifecycleService, driven by the power button), so a freshly
 * created station has no container, no Icecast mount and no cost until
 * somebody presses start. That is also what lets an owner build a playlist
 * and set artwork before anyone can tune in.
 *
 * What's left here is config drift:
 *
 *  • updated   → re-render the .liq (name/genre/desc land in the Icecast
 *                metadata block) and restart — but only while the station is
 *                meant to be running. A stopped station picks up the change
 *                when it next starts, since up() always re-renders.
 *                Jingle settings are the exception: they are interactive
 *                variables in the script, so they go over telnet and cost no
 *                listener their audio.
 *  • deleting  → stop and remove the container (also fires for soft deletes;
 *                listeners stop hearing the station as soon as it's "deleted")
 *  • restored  → bring a soft-deleted station back, if it was running
 *
 * Failures are logged but NOT re-thrown: a Docker daemon hiccup must not
 * cascade-fail the HTTP request that renamed a station. Drift left behind by
 * a failure is picked up by `stations:reconcile`, which converges containers
 * onto whatever `desired_state` says.
 */
class StationObserver
{
    public function __construct(
        private LiquidsoapSupervisor $supervisor,
        private PlaylistFileWriter $playlistWriter,
    ) {}

    /**
     * Claim the station's slot in the container address space before it is
     * written (see the add_container_index migration for why an index rather
     * than an address, and why it is never recycled).
     *
     * `withTrashed()` is load-bearing. Without it a soft-deleted station's
     * index is handed straight back out, which is precisely the recycling this
     * design avoids — and the collision would only surface later, when the
     * original is restored onto an address another station is broadcasting on.
     *
     * The unique constraint is the actual guarantee; this is the fast path.
     * Two stations created in the same instant read the same MAX and one insert
     * loses, which surfaces as a failed create the user can retry. Stations are
     * created by a person pressing a button, so that race is theoretical — but
     * the constraint means it can never become silent.
     */
    public function creating(Station $station): void
    {
        if ($station->container_index !== null) {
            return;
        }

        $station->container_index = (int) Station::withTrashed()->max('container_index') + 1;
    }

    /**
     * Columns whose values are baked into the rendered .liq file. Changing
     * any of these requires a Liquidsoap container restart so the new value
     * lands in the Icecast metadata block / output mount / etc.
     *
     * Importantly this excludes `listener_count` and the timestamps — those
     * change constantly during a broadcast, and restarting Liquidsoap on each
     * change would kick every listener off mid-stream. Live-ness is no longer
     * a column at all (it is an open StreamSession), so the runOnReady /
     * runOnNotReady webhooks no longer touch this row and cannot reach here.
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

    /**
     * Columns that reach a running container over telnet instead of through a
     * restart. Deliberately NOT in the list above: these two are declared as
     * interactive variables in the script (see LiquidsoapSupervisor's
     * VAR_JINGLES_* constants), so changing how often a station ID plays costs
     * nobody their audio.
     *
     * The rendered script still carries them as its initial state, so a
     * station that is stopped — or one whose telnet push fails — picks the new
     * values up on its next start regardless.
     */
    private const JINGLE_COLUMNS = [
        'jingles_enabled',
        'jingle_mode',
        'jingle_interval_seconds',
        'jingle_every_tracks',
    ];

    public function updated(Station $station): void
    {
        // Handled first and independently of everything below: a jingle change
        // is applied to the live container, never by restarting it. A station
        // that is stopped needs nothing at all — up() renders the current
        // values into the script whenever it next starts.
        if ($station->wasChanged(self::JINGLE_COLUMNS) && $station->isRunning()) {
            $this->safely('jingle-settings', $station, fn () => $this->supervisor->applyJingleSettings($station));
        }

        if (! $station->wasChanged(self::LIQ_RELEVANT_COLUMNS)) {
            return;
        }

        // A stopped station has nothing to restart. up() re-renders the .liq
        // from scratch every time, so the edit is picked up whenever the
        // owner next starts it — no drift, no container.
        //
        // The old-slug teardown below still runs either way: a rename leaves
        // a container under the previous name reachable by nobody, and if the
        // station is stopped that container should not exist at all.
        if (! $station->isRunning() && ! $station->wasChanged('slug')) {
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

        if (! $station->isRunning()) {
            return;
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

        // The rendered .liq and the HLS working directory are the supervisor's
        // to clean. Without this they outlive the station forever — small
        // individually, unbounded across every station ever deleted, on a disk
        // shared with the track libraries.
        $this->safely('artifact-wipe', $station, function () use ($station) {
            $this->supervisor->destroyArtifacts($station->slug);
        });
    }

    public function restored(Station $station): void
    {
        // Restore returns the station to whatever state it was in when it was
        // deleted. A station that was off air stays off air.
        if (! $station->isRunning()) {
            return;
        }

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
