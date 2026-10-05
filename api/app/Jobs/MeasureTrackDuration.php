<?php

namespace App\Jobs;

use App\Models\Track;
use App\Services\PlaylistFileWriter;
use App\Services\TrackAnalyzer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Replace one track's header length with the real, decoded one.
 *
 * For tracks analysed before AnalyzeTrack kept the length it decodes. New
 * uploads never need this. Queued by `tracks:measure-durations`.
 *
 * A file ffmpeg cannot decode keeps its header length, unmarked, and is
 * simply never used to time a hard slot start. Nothing here fails the job.
 */
class MeasureTrackDuration implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    /** Same sizing as AnalyzeTrack::$timeout: the process limit plus a margin. */
    public int $timeout;

    public function __construct(
        public readonly string $trackId,
        ?float $durationSeconds = null,
    ) {
        $this->timeout = TrackAnalyzer::timeoutFor($durationSeconds) + 30;
    }

    public function handle(TrackAnalyzer $analyzer, PlaylistFileWriter $writer): void
    {
        $track = Track::query()->with('station')->find($this->trackId);
        $station = $track?->station;

        if ($track === null || $station === null) {
            return;
        }

        $path = $writer->stationDir($station).'/'.basename((string) $track->path);

        $seconds = $analyzer->measureDuration($path, (float) $track->duration_seconds);

        if ($seconds === null) {
            Log::info('track duration could not be measured', [
                'track_id' => $track->getKey(),
                'station' => $station->slug,
            ]);

            return;
        }

        // saveQuietly for the same reason as AnalyzeTrack: a measurement, not
        // an edit, and observers would re-render and restart containers.
        $track->forceFill([
            'duration_seconds' => round($seconds, 3),
            'duration_measured_at' => now(),
        ])->saveQuietly();

    }
}
