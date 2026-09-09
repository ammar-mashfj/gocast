<?php

namespace App\Console\Commands;

use App\Models\StationEvent;
use Illuminate\Console\Command;

/**
 * Deletes station timeline events past their retention window.
 *
 * Shipped alongside the log itself rather than added once the table got big,
 * because this table's growth is driven by failure rather than by success: a
 * healthy station writes a handful of events an hour, and a station whose
 * Icecast source is flapping writes one every few seconds until somebody
 * notices. The worse the week, the faster it grows.
 *
 * Nothing else summarises these rows first, unlike the listener prune, which
 * waits for a rollup. That is deliberate — the value of an event is that a
 * human can read it in context, and there is no aggregate of "container
 * rebooted at 3.04am" worth keeping once nobody is looking at the night it
 * happened.
 *
 * @see StationEvent
 */
class PruneStationEvents extends Command
{
    protected $signature = 'stations:prune-events {--chunk=1000 : Rows to delete per statement}';

    protected $description = 'Delete station events older than the configured retention window';

    public function handle(): int
    {
        $days = (int) config('station_events.retention_days', 30);

        if ($days <= 0) {
            $this->info('Station event retention is disabled (STATION_EVENT_RETENTION_DAYS=0).');

            return self::SUCCESS;
        }

        $cutoff = now()->subDays($days);
        $chunk = max(100, (int) $this->option('chunk'));
        $deleted = 0;

        // Chunked for the same reason the listener prune is: the first run
        // after this ships clears a backlog, and one DELETE spanning it would
        // hold locks long enough to be felt on the live site.
        do {
            $batch = StationEvent::query()
                ->where('created_at', '<', $cutoff)
                ->limit($chunk)
                ->delete();

            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Pruned {$deleted} station events older than {$days} days.");

        return self::SUCCESS;
    }
}
