<?php

namespace App\Jobs;

use App\Enums\StationAudioVerdict;
use App\Models\Station;
use App\Services\StationAudioPolicy;
use App\Services\StationLifecycleException;
use App\Services\StationLifecycleService;
use App\Services\StationStatusService;
use Illuminate\Contracts\Cache\LockTimeoutException;
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

        // Upgraded during a relay show: the plan now has what only a container
        // gives (AutoDJ, an encoder), and the show that kept it on the relay
        // is over. Hand over to a container, as the Start button would,
        // instead of switching off a station its owner just paid to keep on.
        // The plan, not the resolved path: a relay rolled back resolves to a
        // container too, and booting one for every idle Free station is the
        // load the relay exists to remove. Those simply stop.
        //
        // A move that does not happen (the container failed to start, or
        // Icecast could not say the show is over) falls through to the
        // stop: every later sweep would make the same attempt, and the
        // station would hold a running slot, silent, for good.
        try {
            if ($station->usesRelay() && $station->planNeedsContainer() && $this->moveToContainer($station, $lifecycle)) {
                return;
            }

            // force: false on purpose. The policy just concluded nobody is
            // broadcasting, but a broadcaster can connect between that check
            // and this call, and stop() refuses a live station for exactly
            // that reason. Losing the race means the station stays up, which
            // is the outcome we want when someone is on air.
            // reason: 'silent' — this is the sweep's auto-stop, and the
            // station's timeline must not read as though the owner switched
            // it off. That distinction is the first question asked when
            // somebody finds their station unexpectedly off air.
            $lifecycle->stop($station, reason: 'silent');

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
        } catch (LockTimeoutException) {
            // The owner's power button or studio holds the station right now.
            // Not a failure: the sweep queues this again within a minute.
            Log::info('Silent-station stop skipped: the station is busy; the next sweep retries', [
                'station' => $station->slug,
            ]);
        }
    }

    /**
     * @return bool Whether the station is now on a container.
     */
    private function moveToContainer(Station $station, StationLifecycleService $lifecycle): bool
    {
        try {
            $moved = $lifecycle->start($station, reason: 'upgrade');
        } catch (StationLifecycleException $e) {
            Log::info('Moving an upgraded relay station to a container was declined; stopping it instead', [
                'station' => $station->slug,
                'reason' => $e->getMessage(),
            ]);

            return false;
        }

        // start() keeps the relay while Icecast may still carry a show.
        if ($moved->usesRelay()) {
            return false;
        }

        $moved->forceFill(['silent_since' => null])->save();

        Log::info('Station moved off the relay after its show: the plan now needs a container', [
            'station' => $station->slug,
        ]);

        return true;
    }
}
