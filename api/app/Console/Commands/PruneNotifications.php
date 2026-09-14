<?php

namespace App\Console\Commands;

use App\Notifications\Bell\BellNotification;
use Illuminate\Console\Command;
use Illuminate\Notifications\DatabaseNotification;

/**
 * Deletes in-app notifications past their retention window.
 *
 * Shipped with the bell rather than added later, because nothing else ever
 * deletes from this table: the feed is append-only, `read_at` hides nothing,
 * and the only user-driven delete is one row at a time. Without this the table
 * is the one part of the product that only ever grows.
 *
 * Read and unread alike. An unread notification from three months ago has
 * already failed at the only thing it was for, and keeping it means the badge
 * greets a returning user with a number made mostly of history.
 *
 * ONE CALLER READS THESE ROWS AS STATE, not as messages:
 * NudgeInactiveBroadcasters treats the existence of an InactiveBroadcasterNudge
 * row as "already nudged". The retention window therefore has to stay well
 * clear of that command's 7-day candidate window or a dormant account could be
 * nudged a second time — see config/notifications.php, where the default is an
 * order of magnitude larger.
 *
 * @see BellNotification
 */
class PruneNotifications extends Command
{
    protected $signature = 'notifications:prune {--chunk=1000 : Rows to delete per statement}';

    protected $description = 'Delete in-app notifications older than the configured retention window';

    public function handle(): int
    {
        $days = (int) config('notifications.retention_days', 90);

        if ($days <= 0) {
            $this->info('Notification retention is disabled (NOTIFICATION_RETENTION_DAYS=0).');

            return self::SUCCESS;
        }

        $cutoff = now()->subDays($days);
        $chunk = max(100, (int) $this->option('chunk'));
        $deleted = 0;

        // Chunked like the other prunes: the first run after this ships clears
        // whatever has accumulated since the table was created, and one DELETE
        // spanning it would hold locks long enough to be felt on the live site.
        do {
            $batch = DatabaseNotification::query()
                ->where('created_at', '<', $cutoff)
                ->limit($chunk)
                ->delete();

            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Pruned {$deleted} notifications older than {$days} days.");

        return self::SUCCESS;
    }
}
