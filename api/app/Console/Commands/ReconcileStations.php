<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Models\StreamSession;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistFileWriter;
use App\Services\StationStatusService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Converges the Docker daemon onto what the database says should be running.
 *
 * `stations.desired_state` holds intent; the daemon holds reality. They drift
 * for ordinary reasons — a `docker run` that failed during an API request, a
 * container OOM-killed with restart policy exhausted, a station deleted by
 * raw SQL, a host that came back up with stale containers, a test run that
 * left throwaway stations behind.
 *
 * Four kinds of drift, all fixed here:
 *
 *   1. ORPHAN    — a container whose slug matches no station row at all.
 *                  Remove it.
 *   2. UNWANTED  — a container for a station that exists but is stopped or
 *                  soft-deleted. Remove it. (This is what makes the power
 *                  button durable: without it, `--restart unless-stopped`
 *                  would resurrect stopped stations after a host reboot.)
 *   3. MISSING   — a station whose desired_state is 'running' with no
 *                  container. Start it.
 *   4. UNHEALTHY — a container that EXISTS but is not working: restarting in
 *                  a loop, exited, or failing its healthcheck. This class was
 *                  the system's blind spot. A crash-looping container is
 *                  listed by `docker ps -a`, so it is neither missing nor
 *                  unwanted, and nothing ever touched it — a station with a
 *                  broken script restarted forever while the dashboard showed
 *                  "starting" and no alert fired anywhere.
 *
 * Recreating an unhealthy container is capped two ways: it must look unhealthy
 * across consecutive passes (a station legitimately booting is not drift), and
 * only so many recreates are allowed per hour before we stop and leave it for
 * a human. A genuinely broken script must not become an infinite restart loop
 * driven by us instead of by Docker.
 *
 * Also closes stranded broadcast sessions. A StreamSession is opened by
 * MediaMTX's runOnReady webhook and closed by runOnNotReady, and an open
 * session is what makes a station read as live — so a single lost webhook
 * leaves one open forever, which permanently refuses stop (409), permanently
 * exempts the station from the idle reaper, and quietly inflates the airtime
 * totals billing is metered on.
 *
 * Runs every five minutes from the scheduler and after every deploy. Cost is
 * one `docker ps` plus one query; work only happens when there is drift.
 */
class ReconcileStations extends Command
{
    protected $signature = 'stations:reconcile {--dry-run : Report drift without changing anything}';

    protected $description = 'Converge Liquidsoap containers onto the stations that should be running';

    /** Cache key prefix: consecutive passes a station has looked unhealthy. */
    private const UNHEALTHY_PASSES_PREFIX = 'station-unhealthy-passes:';

    /** Cache key prefix: recreates performed for a station in the last hour. */
    private const RECREATES_PREFIX = 'station-recreates:';

    /** Cache key prefix: consecutive passes an open session disagreed with the container. */
    private const LIVE_STRIKES_PREFIX = 'station-live-strikes:';

    public function handle(
        LiquidsoapSupervisor $supervisor,
        PlaylistFileWriter $playlistWriter,
        StationStatusService $statusService,
    ): int {
        $dryRun = (bool) $this->option('dry-run');

        $containerStates = $supervisor->listContainerStates();
        $containers = array_keys($containerStates);

        // Slugs of every station row, including soft-deleted ones: a
        // container for a soft-deleted station is "unwanted" rather than
        // "orphaned", and the two are reported separately so a surprising
        // number of orphans is still visible in the output.
        $knownSlugs = array_flip(Station::withTrashed()->pluck('slug')->all());

        // Intent. Soft-deleted stations are excluded by the global scope —
        // a deleted station must not be broadcasting, whatever its
        // desired_state column says.
        $wantedSlugs = Station::query()->running()->pluck('slug')->all();
        $wantedSet = array_flip($wantedSlugs);

        $orphans = [];
        $unwanted = [];
        $present = [];
        $unhealthy = [];

        foreach ($containerStates as $name => $state) {
            $slug = LiquidsoapSupervisor::slugFromContainerName($name);
            if ($slug === null) {
                continue;
            }

            $present[$slug] = $name;

            if (! isset($knownSlugs[$slug])) {
                $orphans[] = $name;

                continue;
            }

            if (! isset($wantedSet[$slug])) {
                $unwanted[] = $name;

                continue;
            }

            if ($this->looksUnhealthy($state)) {
                $unhealthy[$slug] = $state;
            } else {
                // A pass in which the container looks fine resets the streak,
                // so the counter always measures CONSECUTIVE bad passes.
                Cache::forget(self::UNHEALTHY_PASSES_PREFIX.$slug);
            }
        }

        $missing = array_values(array_filter(
            $wantedSlugs,
            fn (string $slug) => ! isset($present[$slug]),
        ));

        $liveCleared = $this->reconcileLiveFlags($statusService, $dryRun);

        if ($orphans === [] && $unwanted === [] && $missing === [] && $unhealthy === []) {
            $this->info(sprintf(
                '%d container(s), %d station(s) want to be running. Nothing to do.',
                count($containers),
                count($wantedSlugs),
            ));

            return self::SUCCESS;
        }

        $this->warn(sprintf(
            'Drift: %d orphan(s), %d unwanted, %d missing, %d unhealthy%s.',
            count($orphans),
            count($unwanted),
            count($missing),
            count($unhealthy),
            $dryRun ? ' (dry run — not changing anything)' : '',
        ));

        $failed = 0;

        foreach (['orphan' => $orphans, 'unwanted' => $unwanted] as $kind => $names) {
            foreach ($names as $name) {
                if ($dryRun) {
                    $this->line("  • remove {$name} ({$kind})");

                    continue;
                }

                try {
                    $supervisor->removeContainer($name);
                    $this->line("  ✓ removed {$name} ({$kind})");
                } catch (Throwable $e) {
                    $failed++;
                    $this->error("  ✗ {$name}: {$e->getMessage()}");
                }
            }
        }

        // Bringing a station back is the half of reconciliation that keeps a
        // failed start from being permanent: StationLifecycleService records
        // intent before touching Docker precisely so this pass can retry.
        foreach ($missing as $slug) {
            if ($dryRun) {
                $this->line("  • start {$slug} (missing)");

                continue;
            }

            $station = Station::query()->where('slug', $slug)->first();
            if ($station === null) {
                continue;
            }

            try {
                $playlistWriter->write($station);
                $supervisor->up($station);
                $this->line("  ✓ started {$slug}");

                Log::warning('Reconciler restarted a station that should have been running', [
                    'station' => $slug,
                ]);
            } catch (Throwable $e) {
                $failed++;
                $this->error("  ✗ {$slug}: {$e->getMessage()}");
            }
        }

        // A container that exists but is not working. Recreated only after it
        // has looked bad across consecutive passes, and only so many times an
        // hour — a station whose script is genuinely broken must not turn the
        // reconciler into a second restart loop on top of Docker's.
        $threshold = max(1, (int) config('liquidsoap.unhealthy_passes_before_recreate', 2));
        $recreateCap = max(1, (int) config('liquidsoap.unhealthy_recreates_per_hour', 3));

        foreach ($unhealthy as $slug => $state) {
            $passes = (int) Cache::get(self::UNHEALTHY_PASSES_PREFIX.$slug, 0) + 1;

            if (! $dryRun) {
                Cache::put(self::UNHEALTHY_PASSES_PREFIX.$slug, $passes, now()->addHours(6));
            }

            if ($passes < $threshold) {
                $this->line("  • {$slug} unhealthy ({$state['status']}/{$state['health']}), pass {$passes}/{$threshold}");

                continue;
            }

            $recreates = (int) Cache::get(self::RECREATES_PREFIX.$slug, 0);

            if ($recreates >= $recreateCap) {
                // Stop trying. Recreating again would just repeat the same
                // failure; this needs a human to read the container log.
                $this->error("  ✗ {$slug} unhealthy and already recreated {$recreates}x this hour — leaving it");

                Log::error('Station unhealthy and past its recreate budget', [
                    'station' => $slug,
                    'status' => $state['status'],
                    'health' => $state['health'],
                    'recreates_this_hour' => $recreates,
                ]);

                $failed++;

                continue;
            }

            if ($dryRun) {
                $this->line("  • recreate {$slug} (unhealthy: {$state['status']}/{$state['health']})");

                continue;
            }

            $station = Station::query()->where('slug', $slug)->first();
            if ($station === null) {
                continue;
            }

            try {
                $supervisor->removeContainer(LiquidsoapSupervisor::CONTAINER_PREFIX.$slug);
                $playlistWriter->write($station);
                $supervisor->up($station);

                Cache::put(self::RECREATES_PREFIX.$slug, $recreates + 1, now()->addHour());
                Cache::forget(self::UNHEALTHY_PASSES_PREFIX.$slug);

                $this->line("  ✓ recreated {$slug} (was {$state['status']}/{$state['health']})");

                Log::warning('Reconciler recreated an unhealthy station', [
                    'station' => $slug,
                    'status' => $state['status'],
                    'health' => $state['health'],
                ]);
            } catch (Throwable $e) {
                $failed++;
                $this->error("  ✗ {$slug}: {$e->getMessage()}");
            }
        }

        if ($liveCleared > 0) {
            $this->line("  ✓ closed a stranded broadcast session on {$liveCleared} station(s)");
        }

        if ($failed > 0) {
            $this->warn("{$failed} action(s) failed.");

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * Is this container present but not doing its job?
     *
     * `restarting` is the important one: Docker's restart backoff starts around
     * 100ms, so a container crash-looping on a broken script spends most of its
     * early life in `running` and only settles into `restarting` once backoff
     * grows. `exited` covers a container whose restart policy gave up.
     *
     * Health `starting` is deliberately NOT unhealthy — that is the grace
     * period a cold boot is entitled to.
     *
     * @param  array{status: string, health: string}  $state
     */
    private function looksUnhealthy(array $state): bool
    {
        if (in_array($state['status'], ['restarting', 'exited', 'dead', 'paused'], true)) {
            return true;
        }

        return $state['health'] === LiquidsoapSupervisor::HEALTH_UNHEALTHY;
    }

    /**
     * Close broadcast sessions left open on stations whose container says
     * nobody is publishing.
     *
     * A StreamSession is opened by MediaMTX's runOnReady hook and closed by
     * runOnNotReady. Lose the second webhook once — a failed curl, an api
     * restart mid-request — and the session stays open forever. Because an
     * open session is what makes a station read as live, that refuses every
     * stop with 409 and exempts the station from the idle reaper, exactly as
     * the old `is_live` column did; unlike the column, it also corrupts the
     * airtime totals. This is the only path that ever closes it.
     *
     * The container is the authority here, not Redis: the broadcast-state key
     * has a 90-second TTL and nothing refreshes it during a broadcast, so its
     * absence means "the webhook is old", not "nobody is live".
     *
     * Requires consecutive disagreeing passes so a momentary reconnect (the
     * publisher dropping and re-joining between polls) doesn't end a session.
     */
    private function reconcileLiveFlags(StationStatusService $statusService, bool $dryRun): int
    {
        $stations = Station::query()->running()->live()->get();
        $cleared = 0;

        foreach ($stations as $station) {
            $status = $statusService->fetch($station);

            // Unreachable tells us nothing — it is equally consistent with a
            // booting container and a live broadcast we cannot see.
            if ($status === null) {
                continue;
            }

            $key = self::LIVE_STRIKES_PREFIX.$station->id;

            if (($status['source'] ?? null) === 'live') {
                Cache::forget($key);

                continue;
            }

            $strikes = (int) Cache::get($key, 0) + 1;

            if ($dryRun) {
                $this->line("  • {$station->slug} has an open session its container disagrees with (strike {$strikes})");

                continue;
            }

            if ($strikes < 2) {
                Cache::put($key, $strikes, now()->addHour());

                continue;
            }

            StreamSession::where('station_id', $station->id)
                ->whereNull('ended_at')
                ->update(['ended_at' => now()]);
            Cache::forget($key);
            $cleared++;

            Log::warning('Closed a stranded broadcast session', [
                'station' => $station->slug,
                'container_source' => $status['source'] ?? null,
            ]);
        }

        return $cleared;
    }
}
