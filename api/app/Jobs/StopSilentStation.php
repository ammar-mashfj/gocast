<?php

namespace App\Jobs;

use App\Models\Station;
use App\Services\SilentStationPolicy;
use App\Services\StationLifecycleException;
use App\Services\StationLifecycleService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Take a station with no AutoDJ rotation off air, a minute after its
 * broadcaster disconnected.
 *
 * Dispatched with a delay by StationEventController when harbor reports
 * `live_disconnected`. The delay IS the feature: a broadcaster whose socket
 * drops has that long to get back on air before their container is collected,
 * and the studio spends it reconnecting.
 *
 * Nothing is decided here. SilentStationPolicy is re-consulted at execution
 * time, against freshly read state, because everything this job assumed when
 * it was queued may have changed in the meantime — the broadcaster reconnected,
 * tracks were uploaded, the owner pressed stop, the station was deleted. A
 * queued job is a reminder to look, never a decision already taken.
 *
 * There is no cancellation path and there does not need to be one: a job that
 * finds nothing to do returns, and that is cheaper than tracking job ids
 * through a reconnect.
 *
 * This is the fast path only. `stations:reap-silent` applies the same policy
 * every minute, so a dropped notification or a queue outage costs freshness
 * rather than leaving a container up forever.
 */
class StopSilentStation implements ShouldQueue
{
    use Queueable;

    /**
     * One attempt. A retry would re-ask a question whose answer is already
     * being re-asked every minute by the scheduled command, and a station that
     * could not be stopped now is very often one that should no longer be
     * stopped at all (the broadcaster came back).
     */
    public int $tries = 1;

    public function __construct(public string $stationId) {}

    public function handle(SilentStationPolicy $policy, StationLifecycleService $lifecycle): void
    {
        $station = Station::query()->find($this->stationId);

        if ($station === null || ! $policy->shouldStop($station)) {
            return;
        }

        try {
            // force: false on purpose. The policy just checked that nobody is
            // broadcasting, but a broadcaster can connect between that check
            // and this call — and in that race the lifecycle service refusing
            // is exactly the outcome we want. Losing the stop is free; cutting
            // off a live broadcaster is not.
            $lifecycle->stop($station);

            Log::info('Silent station stopped', [
                'station' => $station->slug,
                'window_seconds' => $policy->windowSeconds(),
                'trigger' => 'broadcaster_disconnected',
            ]);
        } catch (StationLifecycleException $e) {
            // Someone went live in the race window above, or another worker
            // got there first. Both are correct outcomes, not failures.
            Log::info('Silent station stop skipped', [
                'station' => $station->slug,
                'reason' => $e->getMessage(),
            ]);
        }
    }
}
