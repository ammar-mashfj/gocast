<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Services\StationLifecycleService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * Takes stations off air when nobody is listening and nobody is broadcasting.
 *
 * A running station holds a Liquidsoap container — memory, CPU, an Icecast
 * source slot, continuous HLS writes — with or without an audience. An AutoDJ
 * rotation left running after a session is exactly the waste the power button
 * was introduced to remove, just self-inflicted rather than automatic.
 *
 * How idleness is measured: `stations:sync-listeners` writes a live listener
 * count into Redis every minute. This command runs hourly and records the
 * moment a station first appeared idle; once that moment is far enough in the
 * past, the station is stopped. Any run that sees listeners or a broadcaster
 * clears the marker, so the window always measures *continuous* idleness.
 *
 * The window is per plan (`plans.idle_stop_hours`): 0 means never reap, null
 * falls back to LIQUIDSOAP_IDLE_STOP_HOURS. Owners restart with one click, and
 * their playlist and settings are untouched.
 */
class ReapIdleStations extends Command
{
    protected $signature = 'stations:reap-idle {--dry-run : Report what would be stopped without stopping it}';

    protected $description = 'Stop stations that have been on air with no listeners and no broadcaster';

    /**
     * Cache key prefix holding the timestamp a station was first seen idle.
     */
    private const IDLE_SINCE_PREFIX = 'station-idle-since:';

    /**
     * How long the idle marker survives. Far longer than any sane window so
     * it is the reaper, not an expiry, that decides — but bounded so a
     * deleted station can't leave a key behind forever.
     */
    private const MARKER_TTL_SECONDS = 7 * 24 * 3600;

    public function handle(StationLifecycleService $lifecycle): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $defaultHours = (int) config('liquidsoap.idle_stop_hours', 6);

        $stations = Station::query()->running()->with('user.plan')->get();

        if ($stations->isEmpty()) {
            $this->info('No stations are on air.');

            return self::SUCCESS;
        }

        $stopped = 0;
        $failed = 0;

        foreach ($stations as $station) {
            $hours = $station->user?->plan?->idle_stop_hours ?? $defaultHours;

            if ($hours <= 0) {
                continue;
            }

            if ($this->hasAudience($station)) {
                Cache::forget(self::IDLE_SINCE_PREFIX.$station->id);

                continue;
            }

            $since = $this->idleSince($station);

            if ($since->diffInHours(now()) < $hours) {
                continue;
            }

            if ($dryRun) {
                $this->line("  • would stop {$station->slug} (idle since {$since->toDateTimeString()})");

                continue;
            }

            try {
                // force: an idle station is by definition not broadcasting,
                // but the flag also covers the race where a StreamSession is
                // still open from a webhook that never fired its not-ready
                // counterpart.
                $lifecycle->stop($station, force: true);
                Cache::forget(self::IDLE_SINCE_PREFIX.$station->id);
                $stopped++;

                $this->line("  ✓ stopped {$station->slug} (idle {$hours}h)");

                Log::info('Station reaped for inactivity', [
                    'station' => $station->slug,
                    'idle_hours' => $hours,
                ]);
            } catch (Throwable $e) {
                $failed++;
                $this->error("  ✗ {$station->slug}: {$e->getMessage()}");
            }
        }

        $this->info(sprintf(
            'Checked %d station(s), stopped %d.',
            $stations->count(),
            $stopped,
        ));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Anyone listening, or anyone broadcasting? Either counts as in use.
     *
     * A missing listener key reads as zero: if `stations:sync-listeners` is
     * down we'd rather not reap on the strength of data we don't have — but
     * that is what the multi-hour window protects against, since the marker
     * is only laid on the first idle observation.
     */
    private function hasAudience(Station $station): bool
    {
        if ($station->isLive()) {
            return true;
        }

        return ((int) Redis::get("listeners:{$station->id}")) > 0;
    }

    /**
     * When this station was first observed idle, laying the marker if this
     * is the first observation.
     */
    private function idleSince(Station $station): Carbon
    {
        $key = self::IDLE_SINCE_PREFIX.$station->id;
        $stored = Cache::get($key);

        if (is_string($stored) && $stored !== '') {
            return Carbon::parse($stored);
        }

        $now = now();
        Cache::put($key, $now->toIso8601String(), self::MARKER_TTL_SECONDS);

        return $now;
    }
}
