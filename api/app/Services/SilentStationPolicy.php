<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Support\Carbon;

/**
 * Decides whether a station with no AutoDJ rotation has been silent long
 * enough to be taken off air.
 *
 * WHY THIS EXISTS. A station whose library is empty has exactly one thing to
 * play when its broadcaster disconnects: the silence bed. The container stays
 * up, holds ~85MB, keeps an Icecast source slot and writes HLS segments
 * forever — all to transmit nothing. `stations:reap-idle` eventually collects
 * it, but that window is measured in hours because it is written for stations
 * that DO have something to play. This one is measured in seconds, because
 * there is nothing to interrupt.
 *
 * THE CLOCK IS `stream_sessions.ended_at`, not a cache key and not an event
 * timestamp. Two reasons. It is persisted, so an API restart cannot lose a
 * station's place and strand a container; and it is the same fact `isLive()`
 * is derived from, so the "is it live" and "how long has it been silent"
 * answers cannot disagree with each other. That is the lesson the old
 * `is_live` column taught — see StationEventController.
 *
 * A station that has NEVER had a broadcaster is deliberately not on this
 * clock. Starting a station and going live a few minutes later is normal, and
 * having the power button switch itself off mid-setup is worse than a few
 * minutes of an idle container. Those are `idle_stop_hours`' problem.
 *
 * Used by two callers that must never disagree, which is the whole reason this
 * is a service and not a method on either of them:
 *
 *   • StopSilentStation — dispatched with a delay when harbor reports the
 *     broadcaster gone. The fast path; costs nothing when nothing happens.
 *   • stations:reap-silent — every minute, over every running station. The
 *     backstop, because a lost event must cost freshness, never a stranded
 *     container.
 */
class SilentStationPolicy
{
    /**
     * How long a station may stay on air after its broadcaster leaves.
     * 0 disables the whole mechanism.
     */
    public function windowSeconds(): int
    {
        return max(0, (int) config('liquidsoap.silent_stop_seconds', 60));
    }

    public function enabled(): bool
    {
        return $this->windowSeconds() > 0;
    }

    /**
     * Should this station be taken off air right now?
     *
     * Deliberately re-read from the database by every caller rather than
     * trusted from the moment the job was queued: sixty seconds is plenty of
     * time for the broadcaster to reconnect, for tracks to be uploaded, or for
     * the owner to press stop themselves.
     */
    public function shouldStop(Station $station): bool
    {
        if (! $this->enabled()) {
            return false;
        }

        // Already off air, or on its way there. Nothing to do, and stopping a
        // stopped station would rewrite `started_at` for no reason.
        if (! $station->isRunning()) {
            return false;
        }

        // The gate the whole feature hangs on: a station with a rotation has
        // real audio to play and must never be stopped for being between
        // broadcasts. Jingles do not count — they are punctuation, and a
        // station whose entire library is jingles has nothing to punctuate.
        if ($station->musicTracks()->exists()) {
            return false;
        }

        // Someone is broadcasting. This is the reconnect case: the studio gets
        // back on air inside the window and the container is never touched.
        if ($station->isLive()) {
            return false;
        }

        $silentSince = $this->silentSince($station);

        if ($silentSince === null) {
            return false;
        }

        return $silentSince->copy()->addSeconds($this->windowSeconds())->isPast();
    }

    /**
     * When this station last stopped being broadcast to, or null if it has
     * never been broadcast to at all.
     *
     * Null is the "never live" case and reads as "not on this clock" — see the
     * class docblock. It is distinct from a station that went live and left,
     * which is exactly what this feature is for.
     */
    public function silentSince(Station $station): ?Carbon
    {
        $endedAt = $station->streamSessions()
            ->whereNotNull('ended_at')
            ->max('ended_at');

        return $endedAt === null ? null : Carbon::parse($endedAt);
    }
}
