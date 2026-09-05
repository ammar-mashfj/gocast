<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Everything the audience screen shows, for one station, over one window.
 *
 * THREE TABLES, EACH ANSWERING WHAT ONLY IT CAN. The temptation is to compute
 * all of this from `listener_sessions`, and it would be wrong twice:
 *
 *   • `listener_stats_hourly` is the only source that includes ICECAST
 *     listeners. They hold a socket and are counted by polling Icecast, so
 *     they never get a session row — summing sessions would silently omit
 *     every listener who is not on our own web player.
 *   • `listener_geo_daily` is the only country source that OUTLIVES the raw
 *     rows, which are pruned at `analytics.retention_days`.
 *   • `listener_sessions` is the only source of device, browser, referrer and
 *     distinct-visitor counts, none of which the rollups carry.
 *
 * So each figure is read from the table that can actually answer it, and the
 * window is capped at retention so the three never disagree about how far back
 * "90 days" goes.
 *
 * Everything is UTC, matching the rollups themselves — a per-user timezone
 * would have to re-bucket the hourly rows on every read, and the day boundary
 * that matters to a broadcaster is the one their numbers were recorded in.
 */
class AudienceReport
{
    public function __construct(private readonly ListenerAnalytics $analytics) {}

    /**
     * Longest any one breakdown list gets.
     *
     * A ceiling on the rows, never on the arithmetic: every list ships the
     * true total alongside it, so truncating the display can't quietly
     * reweight a percentage.
     */
    private const LIST_LIMIT = 12;

    /**
     * @return array<string, mixed>
     */
    public function build(Station $station, int $days): array
    {
        $days = $this->clampWindow($days);

        // Inclusive of today, so `days = 7` is six whole days plus the one in
        // progress — which is what a person means by "the last week" and what
        // the bucket list below has to line up with.
        $start = now()->startOfDay()->subDays($days - 1);

        $samples = $this->dailySamples($station, $start);
        $visitors = $this->dailyVisitors($station, $start);
        $countries = $this->countries($station, $start);
        $sessions = $this->sessionTotals($station, $start);

        $daily = $this->buckets($start, $days, $samples, $visitors);

        return [
            'range_days' => $days,
            'live' => $this->analytics->liveCount($station),
            'peak_all_time' => (int) $station->listenerStats()->max('peak_listeners'),
            'totals' => [
                'listener_minutes' => array_sum(array_column($daily, 'listener_minutes')),
                'peak' => $daily === [] ? 0 : max(array_column($daily, 'peak')),
                'sessions' => array_sum(array_column($daily, 'sessions')),
                // Summed per-day, and that is the only thing it can honestly
                // be: `visitor_hash` is re-keyed every day precisely so a
                // listener cannot be followed across them. Someone who tunes
                // in on Monday and again on Tuesday is two here, and the UI
                // says "per day" rather than implying a deduplicated reach we
                // deliberately made ourselves unable to compute.
                'listeners' => array_sum(array_column($daily, 'listeners')),
                'avg_listen_seconds' => $sessions['avg_seconds'],
                'qualified_listens' => $sessions['qualified'],
            ],
            'daily' => $daily,
            // Each breakdown carries its own TOTAL rather than letting the
            // client add up the rows it was given. Countries and referrers are
            // both unbounded — a station can reach fifty countries and be
            // linked from a hundred sites — so the lists are truncated, and
            // shares computed against the visible rows would say a country was
            // 40% of an audience when it was 12% of one. The total is also
            // what tells "nobody listened" apart from "country lookup is not
            // configured on this deployment": see GeoResolver, where a
            // deployment with no CDN in front records nobody's country at all.
            'countries' => $countries,
            'devices' => $this->breakdown($station, $start, 'device'),
            'browsers' => $this->breakdown($station, $start, 'browser'),
            'referrers' => $this->breakdown($station, $start, 'referrer_host'),
        ];
    }

    /**
     * The widest window worth serving.
     *
     * Capped at retention because the country, device and referrer columns are
     * computed from rows that get pruned: asking for more would render a real
     * listening-time chart beside breakdowns that quietly stop partway, which
     * is worse than a shorter window that is true all the way across.
     */
    public function clampWindow(int $days): int
    {
        $retention = (int) config('analytics.retention_days', 90);

        return max(1, $retention > 0 ? min($days, $retention) : $days);
    }

    /**
     * Listening time, concurrency and arrivals per day, from the sampled
     * rollup — the half of the audience picture that includes Icecast.
     *
     * @return array<string, array{listener_minutes: int, peak: int, sessions: int}>
     */
    private function dailySamples(Station $station, Carbon $start): array
    {
        return DB::table('listener_stats_hourly')
            ->selectRaw('DATE(hour) as day')
            ->selectRaw('SUM(listener_minutes) as listener_minutes')
            // MAX, never SUM: two listeners in one hour and two in the next is
            // a peak of two, not four.
            ->selectRaw('MAX(peak_listeners) as peak')
            ->selectRaw('SUM(sessions_started) as sessions')
            ->where('station_id', $station->id)
            ->where('hour', '>=', $start)
            ->groupBy('day')
            ->get()
            ->keyBy('day')
            ->map(fn ($row) => [
                'listener_minutes' => (int) $row->listener_minutes,
                'peak' => (int) $row->peak,
                'sessions' => (int) $row->sessions,
            ])
            ->all();
    }

    /**
     * Distinct listeners per day, counted from the raw rows rather than summed
     * out of `listener_stats_hourly.unique_listeners` — that column is
     * distinct-per-HOUR, so someone listening from 14:00 to 16:00 would be
     * three people by teatime.
     *
     * @return array<string, int>
     */
    private function dailyVisitors(Station $station, Carbon $start): array
    {
        return DB::table('listener_sessions')
            ->selectRaw('DATE(started_at) as day')
            ->selectRaw('COUNT(DISTINCT visitor_hash) as listeners')
            ->where('station_id', $station->id)
            ->where('started_at', '>=', $start)
            ->groupBy('day')
            ->pluck('listeners', 'day')
            ->map(fn ($count) => (int) $count)
            ->all();
    }

    /**
     * A dense series — one entry per day, zeros included.
     *
     * Rollup rows are sparse by design (a minute with nobody listening writes
     * nothing), so a chart fed the query result directly would draw a quiet
     * fortnight as a narrower busy one. Filling the gaps here rather than in
     * the client means there is one place that knows the window's shape.
     *
     * @param  array<string, array{listener_minutes: int, peak: int, sessions: int}>  $samples
     * @param  array<string, int>  $visitors
     * @return list<array<string, mixed>>
     */
    private function buckets(Carbon $start, int $days, array $samples, array $visitors): array
    {
        $buckets = [];

        for ($i = 0; $i < $days; $i++) {
            $day = $start->copy()->addDays($i)->toDateString();
            $sample = $samples[$day] ?? ['listener_minutes' => 0, 'peak' => 0, 'sessions' => 0];

            $buckets[] = [
                'day' => $day,
                'listener_minutes' => $sample['listener_minutes'],
                'peak' => $sample['peak'],
                'sessions' => $sample['sessions'],
                'listeners' => $visitors[$day] ?? 0,
            ];
        }

        return $buckets;
    }

    /**
     * Countries over the window, busiest first, with the true total beside the
     * truncated list.
     *
     * The total is a second query rather than a sum of the rows above it,
     * because those rows stop at {@see self::LIST_LIMIT} — summing them would
     * make a station heard in thirty countries report the twelve largest as if
     * they were the whole audience.
     *
     * @return array{rows: list<array{country: string, sessions: int, listener_seconds: int}>, total: int}
     */
    private function countries(Station $station, Carbon $start): array
    {
        $base = fn () => DB::table('listener_geo_daily')
            ->where('station_id', $station->id)
            ->where('day', '>=', $start->toDateString());

        $rows = $base()
            ->select('country')
            ->selectRaw('SUM(sessions) as sessions')
            ->selectRaw('SUM(listener_seconds) as listener_seconds')
            ->groupBy('country')
            ->orderByDesc('sessions')
            ->limit(self::LIST_LIMIT)
            ->get()
            ->map(fn ($row) => [
                'country' => (string) $row->country,
                'sessions' => (int) $row->sessions,
                'listener_seconds' => (int) $row->listener_seconds,
            ])
            ->all();

        return ['rows' => $rows, 'total' => (int) $base()->sum('sessions')];
    }

    /**
     * Session counts grouped by one low-cardinality column.
     *
     * Nulls are skipped rather than bucketed as "Unknown": a device we could
     * not parse and a referrer nobody sent are both absence of information,
     * and the screen shows each list as a share of what IS known rather than
     * inventing a category that would often be the largest one.
     *
     * Device and browser are drawn from fixed sets small enough that the limit
     * never bites (see UserAgentParser); referrer is unbounded, which is the
     * reason the total is counted separately rather than summed from the rows.
     *
     * @return array{rows: list<array{label: string, sessions: int}>, total: int}
     */
    private function breakdown(Station $station, Carbon $start, string $column): array
    {
        $base = fn () => DB::table('listener_sessions')
            ->where('station_id', $station->id)
            ->where('started_at', '>=', $start)
            ->whereNotNull($column);

        $rows = $base()
            ->select($column.' as label')
            ->selectRaw('COUNT(*) as sessions')
            ->groupBy($column)
            ->orderByDesc('sessions')
            ->limit(self::LIST_LIMIT)
            ->get()
            ->map(fn ($row) => [
                'label' => (string) $row->label,
                'sessions' => (int) $row->sessions,
            ])
            ->all();

        return ['rows' => $rows, 'total' => (int) $base()->count()];
    }

    /**
     * How long a listen lasts, from the sessions that have actually finished.
     *
     * Open sessions are excluded because their `seconds` is 0 until the sweep
     * closes them — averaging them in would drag the figure down in exact
     * proportion to how many people are listening right now.
     *
     * @return array{avg_seconds: int, qualified: int}
     */
    private function sessionTotals(Station $station, Carbon $start): array
    {
        $minimum = (int) config('analytics.min_listen_seconds', 60);

        $row = DB::table('listener_sessions')
            ->selectRaw('AVG(seconds) as avg_seconds')
            ->selectRaw('SUM(CASE WHEN seconds >= ? THEN 1 ELSE 0 END) as qualified', [$minimum])
            ->where('station_id', $station->id)
            ->where('started_at', '>=', $start)
            ->whereNotNull('ended_at')
            ->first();

        return [
            'avg_seconds' => (int) round((float) ($row->avg_seconds ?? 0)),
            'qualified' => (int) ($row->qualified ?? 0),
        ];
    }
}
