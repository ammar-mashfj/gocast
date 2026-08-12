<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StreamSession;
use App\Models\Track;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * Prometheus text-format metrics for the GoCast stack.
 *
 * Scrape with any Prometheus-compatible collector:
 *   curl -H "X-Internal-Key: $INTERNAL_API_KEY" http://api/api/internal/metrics
 *
 * Keep this controller cheap — it's hit on every scrape interval (default
 * 15s in most setups), and a slow endpoint melts the monitoring stack.
 * Every metric here resolves to a single SQL query, a single Redis call,
 * or a single docker ps; no per-station loops.
 *
 * Why a custom controller and not a Prometheus SDK: the SDK pulls in a
 * persistent storage backend (APCu, Redis) and meaningful new boilerplate
 * for what is, today, a tiny set of cheap counters and gauges. When the
 * metric surface grows past ~30 series, swap in promphp/prometheus_client_php.
 */
class MetricsController extends Controller
{
    public function __invoke(LiquidsoapSupervisor $supervisor): Response
    {
        $lines = [];

        // ---------- Stations ----------
        $totalStations = Station::count();
        $liveStations = Station::where('is_live', true)->count();
        $trashedStations = Station::onlyTrashed()->count();
        $lines[] = '# HELP gocast_stations_total Stations in the database (excluding soft-deleted).';
        $lines[] = '# TYPE gocast_stations_total gauge';
        $lines[] = "gocast_stations_total {$totalStations}";
        $lines[] = '# HELP gocast_stations_live Stations currently flagged is_live in the DB.';
        $lines[] = '# TYPE gocast_stations_live gauge';
        $lines[] = "gocast_stations_live {$liveStations}";
        $lines[] = '# HELP gocast_stations_trashed Soft-deleted stations still recoverable.';
        $lines[] = '# TYPE gocast_stations_trashed gauge';
        $lines[] = "gocast_stations_trashed {$trashedStations}";

        // ---------- Liquidsoap container health ----------
        // The "live" station count above is what the DB *thinks* is happening;
        // these gauges are what the Docker daemon is actually doing. A gap
        // between expected_containers and running_containers means stations
        // exist with no audio pipeline (alert on this).
        try {
            $running = $supervisor->listManagedContainers();
            $runningCount = count($running);
        } catch (Throwable) {
            $runningCount = -1; // proxy/daemon unreachable — surface to alerts
        }

        $expectedContainers = Station::count();
        $lines[] = '# HELP gocast_supervisor_containers_expected Stations that should have a running Liquidsoap container.';
        $lines[] = '# TYPE gocast_supervisor_containers_expected gauge';
        $lines[] = "gocast_supervisor_containers_expected {$expectedContainers}";
        $lines[] = '# HELP gocast_supervisor_containers_running Per-station Liquidsoap containers reported by Docker. -1 means the daemon (or socket-proxy) was unreachable.';
        $lines[] = '# TYPE gocast_supervisor_containers_running gauge';
        $lines[] = "gocast_supervisor_containers_running {$runningCount}";

        // ---------- Stream sessions (24h rolling) ----------
        $sessionsLast24h = StreamSession::where('started_at', '>=', now()->subDay())->count();
        $openSessions = StreamSession::whereNull('ended_at')->count();
        $lines[] = '# HELP gocast_stream_sessions_started_last_24h New stream sessions in the last 24 hours.';
        $lines[] = '# TYPE gocast_stream_sessions_started_last_24h gauge';
        $lines[] = "gocast_stream_sessions_started_last_24h {$sessionsLast24h}";
        $lines[] = '# HELP gocast_stream_sessions_open Stream sessions still flagged as live (ended_at is null).';
        $lines[] = '# TYPE gocast_stream_sessions_open gauge';
        $lines[] = "gocast_stream_sessions_open {$openSessions}";

        // ---------- AutoDJ library ----------
        $totalTracks = Track::count();
        $totalBytes = (int) Track::sum('file_size_bytes');
        $lines[] = '# HELP gocast_tracks_total Total AutoDJ tracks across all stations.';
        $lines[] = '# TYPE gocast_tracks_total gauge';
        $lines[] = "gocast_tracks_total {$totalTracks}";
        $lines[] = '# HELP gocast_tracks_bytes Total on-disk size of AutoDJ library across all stations.';
        $lines[] = '# TYPE gocast_tracks_bytes gauge';
        $lines[] = "gocast_tracks_bytes {$totalBytes}";

        // ---------- Users ----------
        $usersTotal = User::count();
        $lines[] = '# HELP gocast_users_total Registered users.';
        $lines[] = '# TYPE gocast_users_total gauge';
        $lines[] = "gocast_users_total {$usersTotal}";

        // ---------- Queue ----------
        try {
            $queueDepth = (int) DB::table('jobs')->count();
            $failedJobs = (int) DB::table('failed_jobs')->count();
        } catch (Throwable) {
            $queueDepth = -1;
            $failedJobs = -1;
        }
        $lines[] = '# HELP gocast_queue_jobs_pending Pending jobs in the default queue.';
        $lines[] = '# TYPE gocast_queue_jobs_pending gauge';
        $lines[] = "gocast_queue_jobs_pending {$queueDepth}";
        $lines[] = '# HELP gocast_queue_jobs_failed Permanently failed jobs (failed_jobs table). Alert when this grows.';
        $lines[] = '# TYPE gocast_queue_jobs_failed gauge';
        $lines[] = "gocast_queue_jobs_failed {$failedJobs}";

        // ---------- Redis liveness ----------
        try {
            Redis::ping();
            $redisUp = 1;
        } catch (Throwable) {
            $redisUp = 0;
        }
        $lines[] = '# HELP gocast_redis_up 1 if Redis responds to PING from the api container.';
        $lines[] = '# TYPE gocast_redis_up gauge';
        $lines[] = "gocast_redis_up {$redisUp}";

        return response(
            implode("\n", $lines)."\n",
            Response::HTTP_OK,
            ['Content-Type' => 'text/plain; version=0.0.4; charset=utf-8'],
        );
    }
}
