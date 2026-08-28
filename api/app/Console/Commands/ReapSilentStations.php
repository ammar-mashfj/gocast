<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Services\SilentStationPolicy;
use App\Services\StationLifecycleException;
use App\Services\StationLifecycleService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Backstop for StopSilentStation.
 *
 * The delayed job is the fast path: harbor reports the broadcaster gone,
 * Laravel looks again a minute later, the container goes away. Everything
 * about that path is best-effort — the container has to reach the API, the
 * event has to be accepted, the queue has to be running and to still be
 * running sixty seconds later. Any one of those failing would otherwise leave
 * an empty station transmitting silence until the hourly idle reaper noticed.
 *
 * So the same policy is applied here on a timer, over every running station.
 * The two callers share SilentStationPolicy precisely so they cannot drift:
 * this command is not a second implementation of the rule, it is a second
 * opportunity to apply it.
 *
 * Cost when there is nothing to do is one indexed query plus, per running
 * station with an empty rotation, two more. Stations with a rotation are
 * filtered out in SQL rather than in the policy, so the common case — a box
 * full of stations that all have libraries — does not pay per-station at all.
 */
class ReapSilentStations extends Command
{
    protected $signature = 'stations:reap-silent {--dry-run : Report what would be stopped without stopping it}';

    protected $description = 'Stop on-air stations with no AutoDJ rotation whose broadcaster has been gone too long';

    public function handle(SilentStationPolicy $policy, StationLifecycleService $lifecycle): int
    {
        if (! $policy->enabled()) {
            $this->info('Silent-station auto-stop is disabled (LIQUIDSOAP_SILENT_STOP_SECONDS=0).');

            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');

        // `whereDoesntHave` on the music relation is the same gate the policy
        // applies, hoisted into SQL so a fleet of stations with libraries costs
        // one query rather than one per station. The policy still re-checks it
        // per station — this narrows the candidate set, it does not decide.
        $candidates = Station::query()
            ->running()
            ->whereDoesntHave('musicTracks')
            ->cursor();

        $stopped = 0;
        $failed = 0;

        foreach ($candidates as $station) {
            if (! $policy->shouldStop($station)) {
                continue;
            }

            if ($dryRun) {
                $this->line("  • would stop {$station->slug} (silent since {$policy->silentSince($station)?->toDateTimeString()})");

                continue;
            }

            try {
                // force: false — see StopSilentStation. A broadcaster who
                // connects in the race window keeps their container.
                $lifecycle->stop($station);
                $stopped++;

                $this->line("  ✓ stopped {$station->slug} (no rotation, broadcaster gone)");

                Log::info('Silent station stopped', [
                    'station' => $station->slug,
                    'window_seconds' => $policy->windowSeconds(),
                    'trigger' => 'scheduled_sweep',
                ]);
            } catch (StationLifecycleException $e) {
                // Went live between the check and the stop. Correct outcome.
                $this->line("  – skipped {$station->slug}: {$e->getMessage()}");
            } catch (Throwable $e) {
                $failed++;
                $this->error("  ✗ {$station->slug}: {$e->getMessage()}");
            }
        }

        $this->info(sprintf('Stopped %d silent station(s).', $stopped));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
