<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistFileWriter;
use Illuminate\Console\Command;
use Throwable;

/**
 * Ensures every station that WANTS to be on air has a running container.
 *
 * Scoped to `desired_state = running`. A station its owner has not started
 * has no container by design, and relaunching everything would put every
 * station on the box back on air on each deploy — the exact behaviour the
 * power button exists to end.
 *
 * Idempotent — calling LiquidsoapSupervisor::up() on a station whose
 * container already runs just restarts it (cheap, ~3s blip per station).
 *
 * Three reasons to run this:
 *   1. Deploy — backfills any stations that pre-date the per-station
 *      Liquidsoap rollout. Wired into deploy.sh.
 *   2. Recovery — Docker daemon restart, host reboot without restart-policy
 *      doing its job, manual stop, OOM kill. Bring everything back up.
 *   3. Mass config change — bumped Liquidsoap version, edited the .liq Blade
 *      template, etc. Re-render every station's .liq and restart all
 *      containers so they pick up the change.
 *
 * Soft-deleted stations are skipped (their container should already be
 * stopped via the StationObserver's `deleting` hook). Pass --include-trashed
 * to also bring soft-deleted stations back up — useful for a "restore all"
 * recovery scenario, otherwise leave it off.
 */
class RelaunchStations extends Command
{
    protected $signature = 'stations:relaunch
                            {--slug= : Only relaunch one station by slug}
                            {--include-trashed : Also relaunch soft-deleted stations}';

    protected $description = 'Ensure every station that should be on air has a running Liquidsoap container';

    public function handle(LiquidsoapSupervisor $supervisor, PlaylistFileWriter $playlistWriter): int
    {
        $query = Station::query()->running();

        if ($this->option('include-trashed')) {
            $query->withTrashed();
        }

        if ($slug = $this->option('slug')) {
            $query->where('slug', $slug);
        }

        $stations = $query->get();

        if ($stations->isEmpty()) {
            $this->info('No stations to relaunch.');

            return self::SUCCESS;
        }

        $this->info("Relaunching {$stations->count()} station(s)...");

        $failed = 0;

        foreach ($stations as $station) {
            try {
                // Ensure jingles.m3u exists before bringing the container up;
                // Liquidsoap warns and falls back to the bed source when the
                // file is missing, but writing an empty m3u at boot keeps the
                // logs quiet.
                $playlistWriter->write($station);
                $supervisor->up($station);
                $this->line("  ✓ {$station->slug}");
            } catch (Throwable $e) {
                $failed++;
                $this->error("  ✗ {$station->slug}: {$e->getMessage()}");
            }
        }

        if ($failed > 0) {
            $this->warn("{$failed} station(s) failed. Check logs for details.");

            return self::FAILURE;
        }

        $this->info('Done.');

        return self::SUCCESS;
    }
}
