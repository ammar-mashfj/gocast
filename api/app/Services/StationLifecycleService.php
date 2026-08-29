<?php

namespace App\Services;

use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Owns every transition of a station's `desired_state`.
 *
 * The split this class exists to enforce:
 *
 *   • `stations.desired_state` is INTENT — what the owner asked for. It is
 *     written here and nowhere else.
 *   • The Docker daemon holds ACTUAL state. LiquidsoapSupervisor observes and
 *     changes it.
 *   • `stations:reconcile` closes the gap between the two on a schedule.
 *
 * Intent is therefore recorded BEFORE the container is touched. If `docker
 * run` fails, the station stays `running` and the reconciler retries within
 * minutes — a station never silently ends up off air because one API request
 * hit a busy daemon. The inverse holds for stop: intent flips to `stopped`
 * first, so even if `docker rm` fails, the reconciler tears the container
 * down on its next pass.
 *
 * Every transition takes a per-station lock. Two rapid clicks on the power
 * button, or a click racing the studio's start-before-broadcast, would
 * otherwise interleave a `docker run` and a `docker rm -f` on the same
 * container name.
 */
class StationLifecycleService
{
    /**
     * How long a lifecycle lock is held before it self-releases. Comfortably
     * longer than the supervisor's own 10s docker timeout so a slow start
     * can't have its lock expire while `docker run` is still in flight.
     */
    private const LOCK_TTL_SECONDS = 30;

    /**
     * How long a caller waits for a competing transition to finish before
     * giving up. Short — the user is watching a button.
     */
    private const LOCK_WAIT_SECONDS = 8;

    public function __construct(
        private readonly LiquidsoapSupervisor $supervisor,
        private readonly PlaylistFileWriter $playlistWriter,
    ) {}

    /**
     * Put a station on air: record the intent, then bring the container up.
     *
     * Idempotent — starting an already-running station re-asserts the
     * container (cheap when it is already healthy) and returns.
     *
     * @param  string  $reason  Audit breadcrumb: 'owner' for the power button,
     *                          'broadcast' for the implicit start on publish.
     *
     * @throws StationLifecycleException When the owner's plan is out of slots.
     */
    public function start(Station $station, string $reason = 'owner'): Station
    {
        return $this->withLock($station, function () use ($station, $reason) {
            $station->refresh();

            // Already on air with a healthy container: do nothing. up() would
            // restart it, and a restart drops every connected listener — a
            // double-clicked power button must not cost an audience.
            if ($station->isRunning() && $this->supervisor->isRunning($station)) {
                return $station;
            }

            if (! $station->isRunning()) {
                $this->assertCanRunAnother($station);

                $station->forceFill([
                    'desired_state' => Station::STATE_RUNNING,
                    'started_at' => now(),
                ])->save();
            }

            // The observer no longer seeds an m3u at create time, so this is
            // the first moment the jingle file is guaranteed to be needed.
            // Writing it before the container boots keeps Liquidsoap from
            // logging "file not found" on a station with no jingles yet.
            $this->playlistWriter->write($station);
            $this->supervisor->up($station);

            Log::info('Station started', [
                'station' => $station->slug,
                'reason' => $reason,
            ]);

            return $station;
        });
    }

    /**
     * Take a station off air and release its container.
     *
     * @param  bool  $force  Skip the on-air guard. Reserved for admin tooling
     *                       and the idle reaper; the owner-facing endpoint
     *                       never sets it.
     *
     * @throws StationLifecycleException When the station is mid-broadcast.
     */
    public function stop(Station $station, bool $force = false): Station
    {
        return $this->withLock($station, function () use ($station, $force) {
            $station->refresh();

            if (! $force && $station->isLive()) {
                throw StationLifecycleException::liveBroadcast();
            }

            $station->forceFill([
                'desired_state' => Station::STATE_STOPPED,
                'started_at' => null,
            ])->save();

            $this->supervisor->down($station);

            Log::info('Station stopped', [
                'station' => $station->slug,
                'forced' => $force,
            ]);

            return $station;
        });
    }

    /**
     * Does this user's plan have room for one more station on air?
     *
     * Counts intent rather than containers: a station whose container just
     * crashed still holds its slot, because the reconciler is about to bring
     * it back.
     *
     * @throws StationLifecycleException
     */
    private function assertCanRunAnother(Station $station): void
    {
        $user = $station->user;

        if (! $user instanceof User) {
            return;
        }

        $limit = (int) ($user->plan?->max_running_stations ?? 1);

        $running = $user->stations()
            ->running()
            ->whereKeyNot($station->getKey())
            ->count();

        if ($running >= $limit) {
            throw StationLifecycleException::concurrencyLimit($limit);
        }
    }

    /**
     * Is the track library available on this user's plan?
     */
    public function autoDjEnabled(User $user): bool
    {
        return (bool) ($user->plan?->autodj_enabled ?? false);
    }

    /**
     * @throws StationLifecycleException
     */
    public function assertAutoDjEnabled(User $user): void
    {
        if (! $this->autoDjEnabled($user)) {
            throw StationLifecycleException::autoDjUnavailable();
        }
    }

    /**
     * @template T
     *
     * @param  \Closure(): T  $callback
     * @return T
     */
    private function withLock(Station $station, \Closure $callback): mixed
    {
        return Cache::lock("station-lifecycle:{$station->id}", self::LOCK_TTL_SECONDS)
            ->block(self::LOCK_WAIT_SECONDS, $callback);
    }
}
