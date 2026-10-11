<?php

namespace App\Jobs;

use App\Models\Track;
use App\Services\PlaylistFileWriter;
use App\Services\TrackAnalyzer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Measure one uploaded track and store the result.
 *
 * Queued, not inline, and that is the whole reason the analysis can exist at
 * all: it decodes the entire file, which for a long mix is seconds of CPU. An
 * upload that waited for it would be an upload that times out on a slow box,
 * and the measurement is not needed until the track's turn comes round.
 *
 * A track plays perfectly well unanalysed — no cue points, no gain correction,
 * exactly the behaviour that shipped before this existed. So every failure
 * here is cosmetic by construction, which is why nothing in this job is
 * allowed to bubble up and mark the queue job failed: a file ffmpeg dislikes
 * is a note in a column, not an alert.
 */
class AnalyzeTrack implements ShouldQueue
{
    use Queueable;

    /**
     * One retry, for the transient case — the Docker daemon busy, a disk
     * hiccup. A file that genuinely cannot be decoded fails identically the
     * second time, and `analyzed_at` being set is what stops the backfill
     * picking it up again after that.
     */
    public int $tries = 2;

    /**
     * Seconds the worker lets this run before it SIGKILLs itself.
     *
     * Set per job rather than left to `queue:work --timeout` (60s by
     * default) because that default is what used to kill the worker: a
     * 77-minute mix takes ffmpeg about three minutes, the alarm fired at 60,
     * and the worker died with `Killed` on the console. SIGKILL does not
     * reach the docker client either, so the ffmpeg container kept a core
     * busy until it finished on its own — and `analyzed_at` never got set, so
     * the backfill queued the same file again next run.
     *
     * The value is the process timeout for a file this long plus a margin
     * for the container start, the DB round trips and the m3u rewrite. The
     * process timeout is meant to be the one that fires: Symfony SIGTERMs
     * the docker client, which forwards it to ffmpeg, and the job records the
     * failure and moves on. This one is the backstop.
     *
     * It must stay below the queue's `retry_after` (config/queue.php), or
     * a second worker would take the job mid-analysis and run ffmpeg twice.
     */
    public int $timeout;

    public function __construct(
        public readonly string $trackId,
        ?float $durationSeconds = null,
    ) {
        $this->timeout = TrackAnalyzer::timeoutFor($durationSeconds) + 30;

        // Its own queue and its own worker (gocast-analysis.service). A batch of
        // uploads is minutes of decoding, and on `default` every verification
        // code and stop check queued behind it waited that long: 120 uploads
        // on 2026-10-10 held the queue for ~15 minutes.
        $this->onQueue('analysis');
    }

    public function handle(TrackAnalyzer $analyzer, PlaylistFileWriter $writer): void
    {
        $track = Track::query()->with('station')->find($this->trackId);

        if ($track === null) {
            // Deleted between upload and analysis. Not worth a log line.
            return;
        }

        $station = $track->station;

        if ($station === null) {
            return;
        }

        $path = $writer->stationDir($station).'/'.basename((string) $track->path);

        $analysis = $analyzer->analyze($path, (float) $track->duration_seconds);

        if (! $analysis->succeeded()) {
            $track->forceFill([
                'analyzed_at' => now(),
                'analysis_error' => $analysis->error,
            ])->saveQuietly();

            Log::info('track analysis failed', [
                'track_id' => $track->getKey(),
                'station' => $station->slug,
                'error' => $analysis->error,
            ]);

            return;
        }

        [$cueIn, $cueOut] = $analysis->cuePoints((float) $track->duration_seconds);

        // saveQuietly: this is a measurement of a file that has not changed,
        // not an edit to the track. Firing model events would put a row in the
        // activity log and, through the observers, re-render and restart
        // containers — a fleet-wide restart triggered by a backfill.
        $track->forceFill([
            'loudness_lufs' => $analysis->loudnessLufs,
            'true_peak_db' => $analysis->truePeakDb,
            'cue_in_seconds' => $cueIn,
            'cue_out_seconds' => $cueOut,
            'analyzed_at' => now(),
            'analysis_error' => null,
        ])->saveQuietly();
    }

    public function failed(?Throwable $e): void
    {
        Log::warning('track analysis job failed', [
            'track_id' => $this->trackId,
            'error' => $e?->getMessage(),
        ]);
    }
}
