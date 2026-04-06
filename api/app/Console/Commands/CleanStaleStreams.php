<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Models\StreamSession;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('app:clean-stale-streams')]
#[Description('End stream sessions that have been running for over 30 minutes with no active relay connection')]
class CleanStaleStreams extends Command
{
    public function handle(): void
    {
        $staleSessions = StreamSession::whereNull('ended_at')
            ->where('started_at', '<', now()->subMinutes(30))
            ->get();

        if ($staleSessions->isEmpty()) {
            $this->info('No stale streams found.');

            return;
        }

        $stationIds = $staleSessions->pluck('station_id')->unique();

        StreamSession::whereIn('id', $staleSessions->pluck('id'))
            ->update(['ended_at' => now()]);

        Station::whereIn('id', $stationIds)
            ->where('is_live', true)
            ->update(['is_live' => false]);

        $this->info("Cleaned {$staleSessions->count()} stale session(s) across {$stationIds->count()} station(s).");
    }
}
