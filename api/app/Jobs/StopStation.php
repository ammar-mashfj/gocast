<?php

namespace App\Jobs;

use App\Enums\StationAudioVerdict;
use App\Models\Station;
use App\Services\StationAudioPolicy;
use App\Services\StationLifecycleException;
use App\Services\StationLifecycleService;
use App\Services\StationStatusService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Log;

/**
 * Take one station off air, because it has nothing to broadcast.
 *
 * WHY THIS IS A JOB and not an inline call in the sweep. Stopping a station is
 * a `docker stop`, and the daemon can stall — socket pressure, image-pull lag,
 * a container ignoring SIGTERM until the timeout expires. Inline, one wedged
 * container would eat the sweep's whole minute and starve every station behind
 * it in the loop. Queued, a slow stop delays only itself.
 *
 * NOTHING IS DECIDED HERE. The policy is re-consulted at execution time against
 * a freshly pulled container status, because everything the sweep saw when it
 * queued this may have changed: the broadcaster reconnected, tracks were
 * uploaded, the owner pressed stop themselves, the station was deleted. A
 * queued job is a reminder to look, never a decision already taken.
 *
 * There is no cancellation path and there does not need to be one — a job that
 * finds nothing to do returns, which is cheaper than tracking job ids through
 * a reconnect.
 */
class StopStation implements ShouldQueue
{
    use Queueable;

    /**
     * One attempt. A retry would re-ask a question that the sweep is already
     * re-asking every minute, and a station that could not be stopped now is
     * very often one that should no longer be stopped at all.
     */
    public int $tries = 1;

    public function __construct(public string $stationId) {}

    /**
     * Keyed on the station, because the sweep will queue this again on its
     * next pass while an earlier copy is still waiting on a stalled daemon.
     * Without it a wedged container accumulates one redundant job per minute,
     * each of which will itself block.
     *
     * dontRelease(): a duplicate is dropped rather than deferred. The next
     * sweep re-derives the verdict from scratch in under a minute, so there is
     * nothing in a queued duplicate worth preserving.
     *
     * @return array<int, object>
     */
    public function middleware(): array
    {
        return [(new WithoutOverlapping($this->stationId))->dontRelease()];
    }

    public function handle(
        StationAudioPolicy $policy,
        StationStatusService $statusService,
        StationLifecycleService $lifecycle,
    ): void {
        $station = Station::query()->with('user.plan')->find($this->stationId);

        if ($station === null || ! $station->isRunning()) {
            return;
        }

        // Deliberately the uncached pull: the sweep read this station's status
        // moments ago, and re-reading a cached copy of that answer would make
        // this re-check theatre. The point of asking again is to see anything
        // that changed since.
        if ($policy->verdict($station, $statusService->pullFresh($station)) !== StationAudioVerdict::Stop) {
            return;
        }

        try {
            // force: false on purpose. The policy just concluded nobody is
            // broadcasting, but a broadcaster can connect between that check
            // and this call, and stop() refuses a live station for exactly
            // that reason. Losing the race means the station stays up, which
            // is the outcome we want when someone is on air.
            $lifecycle->stop($station);

            $station->forceFill(['silent_since' => null])->save();

            Log::info('Station stopped: nothing to broadcast', [
                'station' => $station->slug,
            ]);
        } catch (StationLifecycleException $e) {
            // A refusal is a legitimate answer — most often "someone went live
            // in the last second". Not an error, and not worth a retry.
            Log::info('Silent-station stop declined', [
                'station' => $station->slug,
                'reason' => $e->getMessage(),
            ]);
        }
    }
}
