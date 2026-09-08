<?php

namespace App\Console\Commands;

use App\Models\Station;
use Illuminate\Console\Command;
use Throwable;

/**
 * Erases soft-deleted stations once their grace period is up.
 *
 * Deleting a station has always been reversible: the row is trashed and the
 * container comes down, but the uploaded audio stays on disk so a restore
 * returns the station intact (see StationObserver::forceDeleted, which skips
 * the wipe on purpose for exactly that reason). Nothing ever collected the
 * ones that were never restored, so the library of every station ever deleted
 * was kept forever.
 *
 * That is worst on the account-deletion path. Deleting an account trashes its
 * stations and then scrambles the owner's email, so no one can ever restore
 * them — the audio was unreachable and permanent at the same time, which is
 * both unbounded disk growth and a data-retention promise the terms could not
 * honestly make.
 *
 * This is the collector. Past the window a station is force-deleted, which
 * fires StationObserver::forceDeleted to wipe the playlist tree, the rendered
 * .liq and the HLS artifacts; the `tracks` rows follow via the FK cascade.
 *
 * Force-deleted ONE AT A TIME, and that is not a style choice: a mass delete
 * fires no model events, so every file the observer is responsible for would
 * be stranded on disk with its row gone — the exact leak this command exists
 * to close, made permanent and untraceable.
 */
class PruneDeletedStations extends Command
{
    protected $signature = 'stations:prune-deleted
        {--days= : Override the configured retention window}
        {--dry-run : List what would be erased without touching anything}';

    protected $description = 'Permanently erase stations soft-deleted beyond the retention window';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?? config('liquidsoap.deleted_station_retention_days', 30));

        if ($days <= 0) {
            $this->info('Deleted-station retention is disabled (LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS=0).');

            return self::SUCCESS;
        }

        $cutoff = now()->subDays($days);
        $dryRun = (bool) $this->option('dry-run');

        // onlyTrashed + a cutoff on deleted_at. A station trashed inside the
        // window is left alone however long ago it was created: the clock that
        // matters started when it was deleted.
        $stations = Station::onlyTrashed()
            ->where('deleted_at', '<', $cutoff)
            ->orderBy('deleted_at')
            ->get();

        if ($stations->isEmpty()) {
            $this->info("Nothing to erase: no stations trashed before {$cutoff->toDateTimeString()}.");

            return self::SUCCESS;
        }

        $erased = 0;
        $failed = 0;

        foreach ($stations as $station) {
            if ($dryRun) {
                $this->line("would erase {$station->slug} (deleted {$station->deleted_at->diffForHumans()})");
                $erased++;

                continue;
            }

            try {
                $station->forceDelete();
                $erased++;
            } catch (Throwable $e) {
                // One unreachable station must not strand the rest of the
                // backlog. The row stays trashed and is picked up tomorrow.
                $failed++;
                $this->error("failed to erase {$station->slug}: {$e->getMessage()}");
            }
        }

        $verb = $dryRun ? 'would erase' : 'erased';
        $this->info("{$verb} {$erased} station(s) trashed before {$cutoff->toDateTimeString()}.");

        if ($failed > 0) {
            $this->warn("{$failed} station(s) failed and will be retried on the next run.");
        }

        return self::SUCCESS;
    }
}
