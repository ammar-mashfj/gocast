<?php

namespace App\Console\Commands;

use App\Services\AdminTelegram;
use Illuminate\Console\Command;
use Illuminate\Queue\RedisQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;

/**
 * Alerts when a queue's oldest waiting job has waited too long.
 *
 * Age, not length. A healthy `analysis` queue can hold a hundred uploads, and
 * a stuck `default` can hold three verification codes; what users feel is how
 * long the job at the front has been waiting. On 2026-10-10 `default` sat
 * untouched for an hour and the only sign was a burst of Telegram messages
 * once it moved — this is the check that would have said so at minute five.
 *
 * The alert goes out immediately through AdminTelegram::opsAlert, never on the
 * queue it is reporting on.
 */
class CheckQueueBacklog extends Command
{
    protected $signature = 'queue:check-backlog';

    protected $description = 'Alert the admin when a queue\'s oldest pending job is older than its limit';

    public function handle(AdminTelegram $telegram): int
    {
        $connection = Queue::connection();

        // Only the Redis and database drivers can say how old their oldest job
        // is. `sync` (tests, some dev setups) has no backlog to measure.
        if (! method_exists($connection, 'creationTimeOfOldestPendingJob')) {
            $this->info('The queue driver cannot report job age; nothing to check.');

            return self::SUCCESS;
        }

        /** @var array<string, int> $limits */
        $limits = config('queue.backlog_alert_seconds', []);

        foreach ($limits as $queue => $limitSeconds) {
            $waitingSince = $connection instanceof RedisQueue
                ? $this->redisWaitingSince($connection, $queue)
                : $connection->creationTimeOfOldestPendingJob($queue);

            if ($waitingSince === null) {
                continue;
            }

            $waited = now()->getTimestamp() - (int) $waitingSince;

            if ($waited <= $limitSeconds) {
                continue;
            }

            $minutes = intdiv($waited, 60);
            $size = $connection->size($queue);

            $this->warn("Queue `{$queue}`: oldest job waiting {$minutes} min, {$size} queued.");

            $telegram->opsAlert(
                "queue-backlog:{$queue}",
                "⚠️ <b>Queue stuck: {$queue}</b>\n"
                ."Oldest job has waited {$minutes} min ({$size} queued).\n"
                .'Check <code>journalctl -u gocast-queue -u gocast-realtime -u gocast-analysis</code>.',
            );
        }

        return self::SUCCESS;
    }

    /**
     * When the job now at the front of a Redis queue became available.
     *
     * Not its `createdAt`, which Laravel reads for creationTimeOfOldestPendingJob:
     * that is stamped at dispatch and kept through a release, a retry backoff
     * or a `->delay()`, so a healthy queue would read as stuck the moment such
     * a job reached the front. The database driver has `available_at` for
     * this; Redis keeps nothing, so it is observed here instead. A job not at
     * the front at the previous run (a minute ago) can have waited no longer
     * than since then, and one still at the front keeps the time it was first
     * seen there.
     */
    private function redisWaitingSince(RedisQueue $connection, string $queue): ?int
    {
        $now = now()->getTimestamp();
        $cacheKey = "queue-backlog-head:{$queue}";
        $previous = Cache::get($cacheKey);

        $payload = $connection->getConnection()->lindex($connection->getQueue($queue), 0);

        if (! $payload) {
            Cache::put($cacheKey, ['id' => null, 'since' => null, 'checked' => $now], now()->addDay());

            return null;
        }

        $job = json_decode($payload, true);
        // With the attempt number: a retried job keeps its uuid, and coming
        // back to the front is a new wait, not the old one continuing.
        $id = isset($job['uuid']) ? $job['uuid'].':'.($job['attempts'] ?? 0) : md5($payload);

        if (is_array($previous) && $previous['id'] === $id) {
            $since = $previous['since'];
        } else {
            $createdAt = (int) ($job['createdAt'] ?? $now);
            $since = is_array($previous) ? max($createdAt, (int) $previous['checked']) : $createdAt;
        }

        Cache::put($cacheKey, ['id' => $id, 'since' => $since, 'checked' => $now], now()->addDay());

        return $since;
    }
}
