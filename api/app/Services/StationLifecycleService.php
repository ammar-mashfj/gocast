<?php

namespace App\Services;

use App\Events\StationStateChanged;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

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

            // Recorded here rather than in the controller so the implicit
            // start on publish is logged too — the studio starting a station
            // on the broadcaster's behalf is the single most confusing entry
            // to be missing from a timeline, because from the owner's side
            // nobody pressed anything.
            StationEvent::record($station, StationEvent::TYPE_STARTED, properties: [
                'reason' => $reason,
            ]);

            // So a power press reaches dashboards OTHER than the one that made
            // it: a second tab, a phone left open on the overview, the studio
            // beside the dashboard. The tab that pressed the button already
            // knows from its own response and does not need this.
            //
            // Last in the block, after the container is up and the intent is
            // saved, for the same reason the container callbacks broadcast
            // last: a client's response to this is to refetch, so anything it
            // would want to see has to be true before it asks.
            event(StationStateChanged::for($station, StationEvent::TYPE_STARTED));

            return $station;
        });
    }

    /**
     * Take a station off air and release its container.
     *
     * @param  bool  $force  Skip the on-air guard entirely. Reserved for admin
     *                       tooling and the idle reaper; the owner-facing
     *                       endpoint never sets it — see $cutExternal.
     * @param  string  $reason  Audit breadcrumb, mirroring start()'s: 'owner'
     *                          for the power button, 'silent' for the sweep's
     *                          auto-stop. It is the only thing that tells
     *                          those two apart afterwards — both leave an
     *                          identical `stopped` station behind.
     * @param  bool  $cutExternal  The owner explicitly asked to cut off an
     *                             EXTERNAL broadcast. Unlike $force this is
     *                             conditional: it is honoured only if the open
     *                             session really is external, re-read below
     *                             under the lock. A browser broadcast still
     *                             gets the refusal, because the owner has the
     *                             studio tab and a control that ends it
     *                             cleanly; an encoder broadcast may be coming
     *                             from a machine they cannot reach — a dead
     *                             laptop, or a stranger holding a leaked
     *                             stream key — and taking the station off air
     *                             is the only remedy this app can offer.
     *
     * @throws StationLifecycleException When the station is mid-broadcast.
     */
    public function stop(
        Station $station,
        bool $force = false,
        string $reason = 'owner',
        bool $cutExternal = false,
    ): Station {
        return $this->withLock($station, function () use ($station, $force, $reason, $cutExternal) {
            $station->refresh();

            if (! $force && $station->isLive()) {
                // Name the source in the refusal. An owner whose broadcast is
                // coming from BUTT has no control in this app that can end it,
                // so "end the broadcast" on its own is an instruction with
                // nowhere to carry it out — see the exception.
                $open = $station->streamSessions()
                    ->whereNull('ended_at')
                    ->latest('started_at')
                    ->first(['source_type', 'client']);

                $external = $open?->source_type === 'external';

                // Deciding this HERE, rather than in the controller, is the
                // point of the parameter: between an outside check and this
                // lock the encoder can drop and the studio can take over, and
                // a force computed up there would then kill a browser
                // broadcast the owner never asked to end.
                if (! ($cutExternal && $external)) {
                    throw StationLifecycleException::liveBroadcast(
                        external: $external,
                        client: $open?->client,
                    );
                }

                $reason = 'owner_cutoff';
            }

            $station->forceFill([
                'desired_state' => Station::STATE_STOPPED,
                'started_at' => null,
            ])->save();

            // CLOSE ANY OPEN BROADCAST, for the same reason as the Redis
            // delete below and with the same authority: the owner said stop,
            // the row above already says stopped, and a stopped station cannot
            // have someone on air whatever its other rows claim.
            //
            // BEFORE supervisor->down(), not after, and that ordering is the
            // whole point rather than a style choice. down() can throw — its
            // graceful `docker stop` is wrapped, but the `docker rm -f` behind
            // it is not, so an unreachable daemon raises out of here. Running
            // after it meant the one path that throws was also the one path
            // that skipped this, leaving exactly the stuck state below: the
            // desired_state save has already committed, so the station is
            // stopped with a session still open and no backstop that sweeps it.
            //
            // Ordering it first is enough on its own; a finally would also have
            // to decide what to do about the Redis delete below, and there is
            // no state in which closing the session is the wrong call once
            // desired_state says stopped.
            //
            // Every other way a broadcast ends closes its row from the
            // container's `live_disconnected`. A station being torn down
            // cannot send that — SIGTERM racing an HTTP post at best — and the
            // backstop does not cover it either: ReconcileStations scans
            // `running()->live()`, so a row left open by a station that has
            // just stopped running is never swept.
            //
            // It therefore survives indefinitely. It keeps counting in
            // `gocast_live_stations`, it sits on Recent Broadcasts as a
            // broadcast that never ended, and `isLive()` stays true — so the
            // next time the owner starts the station and presses Take off air
            // they are refused, and sent into the cut-off dialog for a
            // broadcast that finished days ago.
            //
            // Unconditional rather than only on the cut-off path. The ordinary
            // stop refuses while live so it has nothing to close, and the
            // remaining callers — admin tooling, the idle sweep — reach here
            // with $force and leak exactly the same row. A stopped station
            // with an open session is never a state worth preserving.
            //
            // now(), not the moment the broadcaster actually vanished, which
            // nothing knows. Airtime is an over-estimate for a source that
            // died silently — the same over-estimate every lost
            // `live_disconnected` already produces.
            $station->streamSessions()
                ->whereNull('ended_at')
                ->update(['ended_at' => now()]);

            $this->supervisor->down($station);

            // Drop the now-playing payload as part of stopping, rather than
            // leaving it to whoever notices first.
            //
            // Every OTHER path that clears this key needs the container to
            // report in: Liquidsoap pushing an empty payload when a track
            // ends, or StationEventController::closeSessions reacting to a
            // `shutdown` event. A container being torn down has no reliable
            // chance to do either — SIGTERM racing the HTTP post at best, and
            // nothing at all if it was killed outright or had already crashed.
            //
            // So the key would survive its own station by up to the six-hour
            // TTL, and the damage is not cosmetic: the public listeners
            // endpoint falls back to this copy whenever the container is
            // unreachable, so a stopped station keeps reporting a track. The
            // player page reads that as "audible" and hides the entire off-air
            // block — the Off air badge and the notify-me opt-in with it — so
            // the one moment a listener would want to be told about the next
            // broadcast is the moment the UI for it disappears.
            //
            // Intent is authoritative here. The owner said stop; nothing is
            // playing, whatever the container did or didn't manage to say.
            Redis::del("metadata:{$station->id}");

            Log::info('Station stopped', [
                'station' => $station->slug,
                'forced' => $force,
                'reason' => $reason,
            ]);

            StationEvent::record($station, StationEvent::TYPE_STOPPED, properties: [
                'reason' => $reason,
                'forced' => $force,
            ]);

            // Same reasoning as start(), plus one case that only happens here:
            // `stations:sweep` stops a silent station on its own schedule, and
            // nobody pressed anything. Without this the owner's open dashboard
            // sits on "on air" until the next reconcile poll notices.
            event(StationStateChanged::for($station, StationEvent::TYPE_STOPPED));

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
     *
     * Delegates rather than re-reading the column: AutoDjScheduler gates
     * playback on the same question, and two copies of the rule are two
     * chances for the upload half and the playback half to disagree.
     */
    public function autoDjEnabled(User $user): bool
    {
        return $user->canUseAutoDj();
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
