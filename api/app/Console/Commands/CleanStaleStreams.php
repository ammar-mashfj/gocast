<?php

namespace App\Console\Commands;

use App\Models\Station;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Redis;

#[Signature('app:clean-stale-streams')]
#[Description('Mark live stations as offline when the relay no longer has them')]
/**
 * Scheduled every 5 minutes to act as a circuit-breaker for stale streams.
 *
 * - If the relay is unreachable, mark every live station offline.
 * - If the relay is reachable, cross-reference its active station list and
 *   mark any DB-live stations the relay doesn't know about as offline
 *   (handles closed tabs where the silence-timeout notification never arrived).
 */
class CleanStaleStreams extends Command
{
    public function handle(): void
    {
        $relayStations = $this->fetchRelayStations();

        $liveStations = Station::where('is_live', true)->get();

        if ($liveStations->isEmpty()) {
            $this->info('No live stations to check.');

            return;
        }

        $stale = $relayStations === null
            ? $liveStations
            : $liveStations->reject(fn (Station $s) => in_array($s->id, $relayStations, true));

        if ($stale->isEmpty()) {
            $this->info('All live stations are active on the relay.');

            return;
        }

        foreach ($stale as $station) {
            $station->streamSessions()->whereNull('ended_at')->update(['ended_at' => now()]);
            $station->update(['is_live' => false]);
            Redis::del("metadata:{$station->id}");
            Redis::del("listeners:{$station->id}");
        }

        $reason = $relayStations === null ? 'relay unreachable' : 'not present on relay';
        $this->info("Cleaned {$stale->count()} stale station(s) ({$reason}).");
    }

    /**
     * Fetch the list of station IDs the relay currently considers live.
     *
     * @return array<int, string>|null Array of station IDs, or null if relay is unreachable.
     */
    private function fetchRelayStations(): ?array
    {
        try {
            $response = Http::timeout(3)
                ->connectTimeout(2)
                ->get(config('services.relay_stations_url'));

            if (! $response->ok()) {
                return null;
            }

            $stations = $response->json('stations');

            return is_array($stations) ? array_values($stations) : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
