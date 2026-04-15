<?php

namespace App\Console\Commands;

use App\Models\Station;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Redis;

#[Signature('app:clean-stale-streams')]
#[Description('Mark live stations as offline when the relay is unreachable')]
/**
 * Scheduled every 5 minutes to act as a circuit-breaker for stale streams.
 *
 * Pings the relay health endpoint — if unreachable, marks all live stations as
 * offline and closes any open sessions, preventing ghost "live" states when the
 * relay goes down unexpectedly.
 */
class CleanStaleStreams extends Command
{
    public function handle(): void
    {
        if ($this->relayIsHealthy()) {
            $this->info('Relay is healthy, nothing to clean.');

            return;
        }

        $stations = Station::where('is_live', true)->get();

        if ($stations->isEmpty()) {
            $this->info('No live stations to clean.');

            return;
        }

        foreach ($stations as $station) {
            $station->streamSessions()->whereNull('ended_at')->update(['ended_at' => now()]);
            $station->update(['is_live' => false]);
            Redis::del("metadata:{$station->id}");
            Redis::del("listeners:{$station->id}");
        }

        $this->info("Cleaned {$stations->count()} stale station(s).");
    }

    private function relayIsHealthy(): bool
    {
        try {
            $response = Http::timeout(3)
                ->connectTimeout(2)
                ->get(config('services.relay_health_url'));

            return $response->ok() && $response->json('status') === 'ok';
        } catch (\Throwable) {
            return false;
        }
    }
}
