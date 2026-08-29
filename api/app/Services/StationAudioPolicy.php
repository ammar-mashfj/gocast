<?php

namespace App\Services;

use App\Enums\StationAudioVerdict;
use App\Models\Station;

/**
 * Decides whether a running station should be taken off air.
 *
 * THE QUESTION THIS ASKS is "does this station have any source of audio?" —
 * never "is anyone listening?". Those came apart badly in the previous design.
 * A station holds a container whether or not it has an audience, so an empty
 * room looked like waste; but an AutoDJ rotation playing to nobody is the
 * product a customer is paying for, and stopping it is not a saving, it is an
 * outage. The old idle reaper only ever got the right answer by accident — it
 * reaped free stations because the free plan has no AutoDJ, so "no listeners"
 * happened to coincide with "no broadcaster". Enable AutoDJ on free, or set a
 * non-zero window on a paid plan, and it would have cut stations off
 * mid-playback. Listener count no longer participates in this decision at all.
 *
 * WHAT IT READS. One live HTTP answer from the station's own container, plus
 * two database facts. Liquidsoap is the only component that knows what is
 * actually on air; everything Laravel stores about that is a cache of an
 * answer the container will give on request. So this deliberately consults no
 * Redis key, no event timestamp and no `is_live` column — those are what drift,
 * and a drifted cache here means either a stranded container or a live show cut
 * off. The one piece of state it does keep, `stations.silent_since`, is a
 * column rather than a cache entry so that a Redis flush cannot reset every
 * station's clock at once.
 *
 * THE THREE SIGNALS, and why each is needed:
 *
 *   • `broadcaster` — is a source client attached, MUTED OR NOT. Distinct from
 *     `source == "live"`, which goes false as soon as blank.strip demotes a
 *     muted mic. Without this, "the broadcaster went quiet for 15 seconds" and
 *     "the broadcaster hung up" are the same observation, and stopping on it
 *     cuts off a live show.
 *
 *   • `rms` — is sound ACTUALLY leaving the station. Ground truth, independent
 *     of which arm won the fallback. This is the signal that separates a
 *     healthy rotation from a broken one; nothing else in the system can see
 *     the difference.
 *
 *   • the rotation, from the database — only to tell {@see StationAudioVerdict::Fault}
 *     from {@see StationAudioVerdict::Stop}. Silence with nothing to play is an
 *     idle station; silence with a library behind it is a bug.
 *
 * EVERY UNKNOWN FAILS SAFE. An unreachable container, a container too old to
 * report the new fields, and a status that contradicts itself all resolve to
 * "do not stop". The cost of a wrong stop (a broadcast cut off, a paid rotation
 * silenced) is far higher than the cost of a wrong keep (one container held for
 * another minute), so the asymmetry is deliberate.
 */
class StationAudioPolicy
{
    public function __construct(
        private readonly StationLifecycleService $lifecycle,
    ) {}

    /**
     * How long a station may produce no audio, with nothing attached that
     * could start producing some, before it is taken off air. 0 disables
     * stopping entirely.
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
     * Output level at or below which the station counts as producing nothing.
     *
     * Not hardcoded to exactly 0.0: digital silence is 0.0, but an encoder's
     * noise floor or a DC offset can sit a hair above it, and a station that
     * is inaudible to every listener should not be kept alive by a value in
     * the eighth decimal place.
     */
    public function silenceThreshold(): float
    {
        return (float) config('liquidsoap.silence_rms_threshold', 0.0001);
    }

    /**
     * The whole decision, for one station, from one observation.
     *
     * Pure: it reads, it does not write. The caller owns the clock and the
     * dispatch, so this can be exercised against every row of the truth table
     * without a database write or a queued job.
     *
     * @param  array<string, mixed>|null  $status  A FRESH pull from the container —
     *                                             not a cached one. Null means unreachable.
     */
    public function verdict(Station $station, ?array $status): StationAudioVerdict
    {
        // Nothing to decide: the mechanism is switched off.
        if (! $this->enabled()) {
            return StationAudioVerdict::InUse;
        }

        // No answer is not an answer. Booting, crashed and stopped are
        // indistinguishable from here, and none of them is evidence of silence.
        if ($status === null || ! ($status['ready'] ?? false)) {
            return StationAudioVerdict::Unreachable;
        }

        $broadcaster = $status['broadcaster'] ?? null;
        $rms = $status['rms'] ?? null;

        // A container from before these fields existed. During a rollout every
        // station looks like this until it is recreated, and stopping the fleet
        // on the strength of a field that is merely absent would be the worst
        // possible way to ship this.
        if ($broadcaster === null || $rms === null) {
            return StationAudioVerdict::Unreported;
        }

        // Someone is attached. Covers the case the previous design could not
        // see: a broadcaster whose mic is muted is demoted by blank.strip, so
        // the source reads "autodj" while their socket is wide open.
        //
        // `source == "live"` is ORed in rather than trusted alone: if the two
        // ever disagree, the reading that keeps the station on air wins.
        if ($broadcaster === true || ($status['source'] ?? null) === 'live') {
            return StationAudioVerdict::InUse;
        }

        // Sound is coming out. Which arm produced it is not this decision's
        // business — a paid AutoDJ rotation playing to an empty room is a
        // station doing exactly what it was paid for.
        if ((float) $rms > $this->silenceThreshold()) {
            return StationAudioVerdict::InUse;
        }

        // Silent from here down. The remaining question is whether that is
        // expected (nothing to play) or a failure (something to play, playing
        // nothing).
        if ($this->hasPlayableRotation($station)) {
            return StationAudioVerdict::Fault;
        }

        if ($station->silent_since === null) {
            return StationAudioVerdict::Silent;
        }

        return $station->silent_since->copy()->addSeconds($this->windowSeconds())->isPast()
            ? StationAudioVerdict::Stop
            : StationAudioVerdict::Silent;
    }

    /**
     * Is there music this station is both entitled to play and has uploaded?
     *
     * Entitlement is part of the question, not a separate check. A station
     * downgraded from a paid plan keeps its library but loses the AutoDJ arm,
     * so the container correctly plays nothing — and calling that a fault would
     * hold the container open forever while alerting about a bug that is not
     * one. Jingles do not count: they are punctuation, and a library of nothing
     * but jingles has nothing to punctuate.
     */
    private function hasPlayableRotation(Station $station): bool
    {
        $user = $station->user;

        if ($user === null || ! $this->lifecycle->autoDjEnabled($user)) {
            return false;
        }

        return $station->musicTracks()->exists();
    }
}
