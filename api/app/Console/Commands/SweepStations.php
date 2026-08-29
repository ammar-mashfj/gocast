<?php

namespace App\Console\Commands;

use App\Enums\StationAudioVerdict;
use App\Jobs\StopStation;
use App\Models\Station;
use App\Services\StationAudioPolicy;
use App\Services\StationStatusService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Asks, once a minute, of every station that is on air: is there any reason
 * for this container to still exist?
 *
 * ONE COMMAND, ON PURPOSE. This replaces `stations:reap-idle` and
 * `stations:reap-silent`, which each answered a piece of that question from a
 * different proxy — listener counts in Redis, an `is_live` column, rows in
 * `stream_sessions`, the contents of the tracks table — and could therefore
 * disagree with each other about the same station in the same minute. Two of
 * the cases they got wrong were only visible from the seam between them:
 *
 *   • A broadcaster who muted their mic was demoted by blank.strip, so the
 *     container reported `autodj` while their socket was open. Nothing could
 *     tell that from "the broadcaster hung up".
 *
 *   • A paid station whose rotation had stalled reported `source = "autodj"`
 *     and emitted nothing. No mechanism in the system could see it: the silent
 *     reaper skipped it for having a library, and the idle reaper only ever
 *     looked at free-tier stations.
 *
 * So the decision is now one traversal, over one snapshot, per station:
 * {@see StationAudioPolicy::verdict()} returns exactly one verdict and this
 * command acts on it. Every branch terminates in nothing, a clock update, an
 * alert, or a dispatch — never in two of them.
 *
 * WHAT IT DOES NOT DO. Container convergence — starting a station that should
 * be running, removing a container for one that should not — stays in
 * `stations:reconcile`. That is a different question (does the world match the
 * database?) with different answers (start, remove, recreate). This command
 * only ever decides whether a station that is legitimately on air should stop
 * being on air.
 *
 * COST is one HTTP round trip per running station per minute, bounded by
 * `liquidsoap.harbor_timeout`. Stops are dispatched rather than performed
 * inline so that one stalled `docker stop` cannot eat the pass.
 */
class SweepStations extends Command
{
    protected $signature = 'stations:sweep {--dry-run : Report verdicts without stopping anything}';

    protected $description = 'Take stations off air when they have no audio to broadcast and nothing to produce any';

    public function handle(StationAudioPolicy $policy, StationStatusService $statusService): int
    {
        if (! $policy->enabled()) {
            $this->info('Station auto-stop is disabled (LIQUIDSOAP_SILENT_STOP_SECONDS=0).');

            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');

        // `user.plan` is eager-loaded because the policy asks about AutoDJ
        // entitlement per station; without it this is an N+1 across the fleet.
        $stations = Station::query()->running()->with('user.plan')->cursor();

        /** @var array<string, int> $tally */
        $tally = [];
        $failed = 0;

        foreach ($stations as $station) {
            try {
                $verdict = $policy->verdict($station, $statusService->pullFresh($station));
                $tally[$verdict->value] = ($tally[$verdict->value] ?? 0) + 1;

                $this->apply($station, $verdict, $dryRun);
            } catch (Throwable $e) {
                // Per station, so one unreachable daemon or one malformed row
                // cannot abort the pass for everybody behind it in the loop.
                // This is the isolation four separate commands used to get for
                // free from being four separate processes.
                $failed++;
                $this->error("  ✗ {$station->slug}: {$e->getMessage()}");

                Log::warning('Station sweep failed for one station', [
                    'station' => $station->slug,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $this->info($this->summarise($tally, $failed));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Carry out the one action this verdict implies.
     *
     * The clock lives here rather than in the policy so the policy stays pure
     * and can be exercised against every row of the decision table without a
     * database write.
     */
    private function apply(Station $station, StationAudioVerdict $verdict, bool $dryRun): void
    {
        switch ($verdict) {
            case StationAudioVerdict::InUse:
                // Any evidence of use resets the window, which is what makes it
                // measure CONTINUOUS silence rather than cumulative silence.
                $this->clearClock($station, $dryRun);
                break;

            case StationAudioVerdict::Unreachable:
            case StationAudioVerdict::Unreported:
                // Absence of evidence. The clock is neither started nor
                // advanced nor cleared: a station that was already silent when
                // its container became unreachable should not have its window
                // restarted by the outage.
                break;

            case StationAudioVerdict::Silent:
                $this->startClock($station, $dryRun);
                break;

            case StationAudioVerdict::Fault:
                // A rotation that should be playing and is not. Reported, never
                // stopped — see StationAudioVerdict::Fault. The clock is left
                // alone so that if the plan later changes or the library is
                // emptied, the station is judged from that moment on.
                $this->line("  ! {$station->slug}: rotation present but producing no audio");

                Log::warning('Station has a rotation but is producing no audio', [
                    'station' => $station->slug,
                ]);
                break;

            case StationAudioVerdict::Stop:
                if ($dryRun) {
                    $this->line("  • would stop {$station->slug} (silent since {$station->silent_since?->toDateTimeString()})");
                    break;
                }

                $this->line("  ✓ queued stop for {$station->slug}");
                StopStation::dispatch($station->id);
                break;
        }
    }

    /**
     * Start the silence window, if it is not already running.
     *
     * Written only on an observation where the container actually ANSWERED —
     * which is guaranteed here, because an unreachable container never reaches
     * this verdict. That is what stops a slow boot on a busy daemon from
     * counting as silence.
     */
    private function startClock(Station $station, bool $dryRun): void
    {
        if ($station->silent_since !== null || $dryRun) {
            return;
        }

        $station->forceFill(['silent_since' => now()])->save();
    }

    private function clearClock(Station $station, bool $dryRun): void
    {
        if ($station->silent_since === null || $dryRun) {
            return;
        }

        $station->forceFill(['silent_since' => null])->save();
    }

    /**
     * @param  array<string, int>  $tally
     */
    private function summarise(array $tally, int $failed): string
    {
        if ($tally === [] && $failed === 0) {
            return 'No stations are on air.';
        }

        ksort($tally);

        $parts = [];

        foreach ($tally as $verdict => $count) {
            $parts[] = "{$verdict}={$count}";
        }

        if ($failed > 0) {
            $parts[] = "errors={$failed}";
        }

        return 'Swept '.array_sum($tally).' station(s): '.implode(' ', $parts);
    }
}
