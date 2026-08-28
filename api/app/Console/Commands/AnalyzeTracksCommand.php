<?php

namespace App\Console\Commands;

use App\Jobs\AnalyzeTrack;
use App\Models\Station;
use App\Models\Track;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * Queue loudness and cue-point analysis for tracks that have none.
 *
 * Every upload is analysed automatically; this is for the library that
 * already existed when the analyser did not, and for re-measuring after a
 * change to the silence thresholds. Retuning the LOUDNESS TARGET needs
 * nothing at all — only raw measurements are stored, and the gain is derived
 * when each annotation is built, so the whole library relevels at each
 * station's next track boundary.
 *
 * Queues work rather than doing it: each track is a full decode, and a few
 * thousand of them should go through the same workers at the same rate as
 * everything else rather than pinning a box from a terminal.
 */
class AnalyzeTracksCommand extends Command
{
    protected $signature = 'tracks:analyze
        {--station= : Limit to one station, by slug}
        {--force : Re-analyse tracks that already have results}
        {--retry-failed : Include tracks whose last analysis failed}
        {--limit=0 : Stop after queueing this many (0 = no limit)}';

    protected $description = 'Queue loudness and cue-point analysis for tracks that lack it';

    public function handle(): int
    {
        if (! config('liquidsoap.analysis_enabled', true)) {
            $this->warn('Track analysis is disabled (LIQUIDSOAP_ANALYSIS_ENABLED=false).');
            $this->line('Queueing anyway would measure files the annotations then ignore.');

            return self::FAILURE;
        }

        $query = Track::query()->orderBy('created_at');

        if ($slug = $this->option('station')) {
            $station = Station::query()->where('slug', $slug)->first();

            if ($station === null) {
                $this->error("No station with slug [{$slug}].");

                return self::FAILURE;
            }

            $query->where('station_id', $station->getKey());
        }

        // A track that failed is not retried by default. The usual cause is a
        // file ffmpeg cannot decode, which fails identically every time, and a
        // backfill that re-queues those on every run is a queue that never
        // drains.
        if (! $this->option('force')) {
            $query->where(function (Builder $q): void {
                $q->whereNull('analyzed_at');

                if ($this->option('retry-failed')) {
                    $q->orWhereNotNull('analysis_error');
                }
            });
        }

        $limit = max(0, (int) $this->option('limit'));

        if ($limit > 0) {
            $query->limit($limit);
        }

        $total = (clone $query)->count();

        if ($total === 0) {
            $this->info('Nothing to analyse.');

            return self::SUCCESS;
        }

        $this->info("Queueing {$total} track(s) for analysis.");
        $bar = $this->output->createProgressBar($total);

        $queued = 0;
        $query->chunkById(200, function ($tracks) use (&$queued, $bar): void {
            foreach ($tracks as $track) {
                AnalyzeTrack::dispatch($track->getKey());
                $queued++;
                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine(2);
        $this->info("Queued {$queued} track(s). Results land as the workers get to them.");

        return self::SUCCESS;
    }
}
