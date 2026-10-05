<?php

namespace App\Console\Commands;

use App\Jobs\MeasureTrackDuration;
use App\Models\Station;
use App\Models\Track;
use Illuminate\Console\Command;

/**
 * Queue a length measurement for every track whose length is still the
 * upload header's guess.
 *
 * Run once after deploying `duration_measured_at`; uploads from then on are
 * measured by AnalyzeTrack. Far cheaper than `tracks:analyze --force`: a
 * plain decode, without the loudness meter that dominates analysis.
 */
class MeasureTrackDurationsCommand extends Command
{
    protected $signature = 'tracks:measure-durations
        {--station= : Limit to one station, by slug}
        {--limit=0 : Stop after queueing this many (0 = no limit)}';

    protected $description = 'Queue a real-length measurement for tracks that only have the header estimate';

    public function handle(): int
    {
        $query = Track::query()->whereNull('duration_measured_at')->orderBy('created_at');

        if ($slug = $this->option('station')) {
            $station = Station::query()->where('slug', $slug)->first();

            if ($station === null) {
                $this->error("No station with slug [{$slug}].");

                return self::FAILURE;
            }

            $query->where('station_id', $station->getKey());
        }

        if (! (clone $query)->exists()) {
            $this->info('Every track already has a measured length.');

            return self::SUCCESS;
        }

        // Capped by hand: chunkById replaces any limit() with its chunk size.
        $limit = max(0, (int) $this->option('limit'));
        $queued = 0;
        $query->chunkById(200, function ($tracks) use (&$queued, $limit): bool {
            foreach ($tracks as $track) {
                if ($limit > 0 && $queued >= $limit) {
                    return false;
                }

                MeasureTrackDuration::dispatch($track->getKey(), (float) $track->duration_seconds);
                $queued++;
            }

            return true;
        });

        $this->info("Queued {$queued} track(s). Lengths land as the workers get to them.");

        return self::SUCCESS;
    }
}
