<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fills in the parts of the rollups that can only be known from session rows:
 * how many people arrived, how many were distinct, how many stayed long enough
 * to count, and which countries they were in.
 *
 * RECOMPUTES RATHER THAN ACCUMULATES, and that is the whole design.
 *
 * The obvious implementation adds each hour's numbers once, as the hour ends.
 * It is also wrong here, because a session's duration is not known when its
 * starting hour closes — someone who pressed play at 14:50 and is still
 * listening at 15:05 has `seconds = 0` on disk, so an accumulating rollup
 * would permanently record them as a bounce. Waiting until every session could
 * possibly have ended means a twelve-hour lag on the dashboard.
 *
 * So instead each run recomputes a trailing window from scratch and overwrites.
 * Late-closing sessions are picked up on the next pass; a run that is missed,
 * or a scheduler that was down for a day, repairs itself; and running the
 * command twice does nothing the second time. The cost is one grouped scan of
 * a window of `listener_sessions` per run, which the (station_id, started_at)
 * index serves directly.
 *
 * The sample-derived columns — peak_listeners, listener_minutes,
 * sampled_minutes — are NEVER touched here. Those accumulate a minute at a
 * time in `listeners:sweep` and cannot be recomputed from anything, because
 * the samples they came from are not stored.
 */
class RollupListenerStats extends Command
{
    protected $signature = 'listeners:rollup
                            {--hours=13 : How many trailing hours of hourly stats to recompute}
                            {--days=3 : How many trailing days of country stats to recompute}';

    protected $description = 'Recompute session-derived listener statistics for the recent window';

    public function handle(): int
    {
        // Default window is one hour longer than the maximum session length,
        // so every session that could still have been open during the oldest
        // hour in the window has certainly been closed by now and contributes
        // its real duration.
        $hours = max(1, (int) $this->option('hours'));
        $days = max(1, (int) $this->option('days'));

        $hourly = $this->rollupHours($hours);
        $geo = $this->rollupCountries($days);

        $this->info("Rolled up {$hourly} station-hours and {$geo} station-country-days.");

        return self::SUCCESS;
    }

    /**
     * Per station, per hour: arrivals, distinct listeners, and how many stayed.
     *
     * Attributed to the hour a session STARTED, so one listen belongs to one
     * hour however long it runs — the same convention the broadcast activity
     * chart uses for shows that cross midnight.
     */
    private function rollupHours(int $hours): int
    {
        $since = now()->subHours($hours)->startOfHour();
        $minimum = (int) config('analytics.min_listen_seconds', 60);

        $rows = DB::table('listener_sessions')
            ->selectRaw("station_id, DATE_FORMAT(started_at, '%Y-%m-%d %H:00:00') as hour")
            ->selectRaw('COUNT(*) as sessions_started')
            ->selectRaw('COUNT(DISTINCT visitor_hash) as unique_listeners')
            // Only closed sessions can qualify: an open one has seconds = 0
            // until the sweep writes its duration, and counting it now would
            // record a listener who is still there as someone who left early.
            ->selectRaw('SUM(CASE WHEN ended_at IS NOT NULL AND seconds >= ? THEN 1 ELSE 0 END) as qualified_listens', [$minimum])
            ->where('started_at', '>=', $since)
            ->groupBy('station_id', 'hour')
            ->get();

        foreach ($rows->chunk(500) as $chunk) {
            $values = [];
            $bindings = [];

            foreach ($chunk as $row) {
                $values[] = '(?, ?, ?, ?, ?)';
                array_push(
                    $bindings,
                    $row->station_id,
                    $row->hour,
                    (int) $row->sessions_started,
                    (int) $row->unique_listeners,
                    (int) $row->qualified_listens,
                );
            }

            // The three sample columns are absent from the UPDATE clause on
            // purpose — see the class docblock. On INSERT they take their
            // column defaults of 0, which is the truth for an hour the sweep
            // never sampled.
            DB::statement(
                'INSERT INTO listener_stats_hourly
                    (station_id, hour, sessions_started, unique_listeners, qualified_listens)
                 VALUES '.implode(', ', $values).'
                 ON DUPLICATE KEY UPDATE
                    sessions_started  = VALUES(sessions_started),
                    unique_listeners  = VALUES(unique_listeners),
                    qualified_listens = VALUES(qualified_listens)',
                $bindings,
            );
        }

        return $rows->count();
    }

    /**
     * Per station, per day, per country.
     *
     * Only CLOSED sessions contribute, because the figure people want from
     * this table is listening time and an open session has none yet. The
     * trailing window means a session that closes tomorrow still lands on the
     * day it began, on the next run.
     *
     * The window must stay well inside `analytics.retention_days`: recomputing
     * a day whose sessions have already been pruned would overwrite a real
     * historical row with zero. Three days against a ninety-day retention is
     * not close to that edge, and the guard is the reason the option exists
     * rather than the window being widened casually.
     */
    private function rollupCountries(int $days): int
    {
        $retention = (int) config('analytics.retention_days', 90);

        if ($retention > 0 && $days >= $retention) {
            $this->error("--days={$days} reaches past the {$retention}-day session retention; refusing to overwrite rolled-up history with pruned data.");

            return 0;
        }

        $since = now()->subDays($days)->startOfDay();

        $rows = DB::table('listener_sessions')
            ->selectRaw('station_id, DATE(started_at) as day, country')
            ->selectRaw('COUNT(*) as sessions')
            ->selectRaw('SUM(seconds) as listener_seconds')
            ->where('started_at', '>=', $since)
            ->whereNotNull('ended_at')
            ->whereNotNull('country')
            ->groupBy('station_id', 'day', 'country')
            ->get();

        foreach ($rows->chunk(500) as $chunk) {
            $values = [];
            $bindings = [];

            foreach ($chunk as $row) {
                $values[] = '(?, ?, ?, ?, ?)';
                array_push(
                    $bindings,
                    $row->station_id,
                    $row->day,
                    $row->country,
                    (int) $row->sessions,
                    (int) $row->listener_seconds,
                );
            }

            DB::statement(
                'INSERT INTO listener_geo_daily
                    (station_id, day, country, sessions, listener_seconds)
                 VALUES '.implode(', ', $values).'
                 ON DUPLICATE KEY UPDATE
                    sessions         = VALUES(sessions),
                    listener_seconds = VALUES(listener_seconds)',
                $bindings,
            );
        }

        return $rows->count();
    }
}
