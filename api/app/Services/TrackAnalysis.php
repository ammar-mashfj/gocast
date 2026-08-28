<?php

namespace App\Services;

/**
 * What TrackAnalyzer measured, or why it couldn't.
 *
 * Deliberately holds MEASUREMENTS and no decisions. The gain we finally ask
 * Liquidsoap for is computed from these against the install's loudness target
 * when the annotation is built (see `amplifyDb()`), so retuning that target
 * relevels an entire library on the next track boundary rather than requiring
 * every file to be decoded again.
 */
final readonly class TrackAnalysis
{
    public function __construct(
        public ?float $loudnessLufs = null,
        public ?float $truePeakDb = null,
        public ?float $cueInSeconds = null,
        public ?float $cueOutSeconds = null,
        public ?string $error = null,
    ) {}

    public static function failed(string $error): self
    {
        return new self(error: $error);
    }

    public function succeeded(): bool
    {
        return $this->error === null && $this->loudnessLufs !== null;
    }

    /**
     * The gain, in dB, that moves this track to the install's loudness target
     * — or null when there is nothing to say.
     *
     * Two guards, and both matter more than the target itself:
     *
     * TRUE PEAK. Gain is capped so the track's loudest sample lands no higher
     * than the ceiling. Loudness and peak are different measurements: a sparse,
     * dynamic recording can sit far below target while already touching 0 dBFS,
     * and raising it to hit the target would clip on every transient. The
     * limiter downstream would catch it, but a limiter working hard is
     * distortion — it is there for what we failed to predict, not as the plan.
     *
     * MAX GAIN. A hard ceiling on how far anything is lifted. A near-silent
     * field recording needs +30 dB to reach target, and applying it amplifies
     * the noise floor into a hiss louder than the content ever was. Past a
     * point the honest answer is that the file is quiet.
     *
     * Attenuation is deliberately not capped the same way: turning something
     * down cannot introduce noise, and the loud files are the ones causing the
     * problem this feature exists to solve.
     */
    public function amplifyDb(): ?float
    {
        if ($this->loudnessLufs === null) {
            return null;
        }

        $target = (float) config('liquidsoap.loudness_target_lufs', -14.0);
        $ceiling = (float) config('liquidsoap.loudness_ceiling_db', -1.0);
        $maxGain = abs((float) config('liquidsoap.loudness_max_gain_db', 12.0));

        $gain = $target - $this->loudnessLufs;

        if ($this->truePeakDb !== null) {
            $gain = min($gain, $ceiling - $this->truePeakDb);
        }

        $gain = min($gain, $maxGain);

        // Below a fraction of a dB there is nothing a listener could hear, and
        // an annotation on every track in the library is not free to carry.
        return abs($gain) < 0.1 ? null : round($gain, 2);
    }

    /**
     * Cue points, but only when they leave a track worth playing.
     *
     * A measurement that would trim a file to almost nothing is far more
     * likely to be wrong than the file is to be that short — a mis-detected
     * threshold on a quiet ambient intro, say. Getting this wrong is
     * expensive: the track is silently truncated on air and the recording
     * itself looks fine when anyone goes to check.
     *
     * @return array{0: float|null, 1: float|null}
     */
    public function cuePoints(float $durationSeconds): array
    {
        $minimum = max(1.0, (float) config('liquidsoap.cue_min_playable_seconds', 5.0));

        $in = $this->cueInSeconds;
        $out = $this->cueOutSeconds;

        // A cue-out past the end of the file says nothing; drop it rather than
        // annotating a boundary the decoder would have reached anyway.
        if ($out !== null && $durationSeconds > 0 && $out >= $durationSeconds - 0.05) {
            $out = null;
        }

        $start = $in ?? 0.0;
        $end = $out ?? ($durationSeconds > 0 ? $durationSeconds : null);

        if ($end !== null && $end - $start < $minimum) {
            return [null, null];
        }

        return [
            $in !== null && $in > 0.05 ? round($in, 3) : null,
            $out !== null ? round($out, 3) : null,
        ];
    }
}
