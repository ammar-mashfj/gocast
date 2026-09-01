<?php

namespace App\Console\Commands;

use App\Models\ListenerSession;
use Illuminate\Console\Command;

/**
 * Deletes raw listener rows past their retention window.
 *
 * This is the only place anything is deleted from listener analytics, and it
 * is what makes the design sustainable rather than merely correct. A busy
 * station opens a few thousand sessions a day; without pruning the table grows
 * for as long as the product exists. With it, deletes come into balance with
 * inserts after the first ninety days and the table simply stops growing.
 *
 * Nothing on the dashboard disappears when it runs, because everything with a
 * longer shelf life was summarised into listener_stats_hourly and
 * listener_geo_daily before the raw rows aged out — which is the reason those
 * rollups exist at all. What is lost is per-listener detail older than the
 * window: the individual durations, devices, and referrers.
 *
 * It also disposes of the last thing here that resembles personal data. The
 * daily-salted visitor hashes stop being linkable within a day; after this
 * they are gone entirely.
 */
class PruneListenerSessions extends Command
{
    protected $signature = 'listeners:prune {--chunk=1000 : Rows to delete per statement}';

    protected $description = 'Delete listener sessions older than the configured retention window';

    public function handle(): int
    {
        $days = (int) config('analytics.retention_days', 90);

        if ($days <= 0) {
            $this->info('Listener session retention is disabled (ANALYTICS_RETENTION_DAYS=0).');

            return self::SUCCESS;
        }

        $cutoff = now()->subDays($days);
        $chunk = max(100, (int) $this->option('chunk'));
        $deleted = 0;

        // Chunked, not one statement. The first run after this ships will have
        // a large backlog, and a single DELETE covering hundreds of thousands
        // of rows holds locks and a rollback segment for long enough to be felt
        // on the live site. A loop of bounded deletes is slower in total and
        // invisible while it runs, which is the correct trade for a nightly
        // maintenance job.
        do {
            $batch = ListenerSession::query()
                ->where('started_at', '<', $cutoff)
                ->limit($chunk)
                ->delete();

            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Pruned {$deleted} listener sessions older than {$days} days.");

        return self::SUCCESS;
    }
}
