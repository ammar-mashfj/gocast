<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Models\StreamSession;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * Polls Icecast for per-mount listener counts and caches them in Redis under
 * `listeners:{station_id}` — the key ListenerCountController and the player UI
 * read.
 *
 * Icecast is the only component that knows how many listeners a station has:
 * Liquidsoap just pushes bytes at a mount, and MediaMTX only sees the inbound
 * broadcaster. So we ask Icecast's admin API directly rather than having
 * anything push to us. (The old Node relay did this same poll; when it was
 * removed nothing took the job over and every station reported 0 listeners.)
 *
 * Values carry a TTL so a stalled scheduler degrades to "no data" instead of
 * pinning stale counts on the dashboard forever.
 */
class SyncListenerCounts extends Command
{
    protected $signature = 'stations:sync-listeners';

    protected $description = 'Poll Icecast for per-mount listener counts and cache them in Redis';

    /**
     * How long a cached count stays valid. Comfortably longer than the
     * one-minute schedule so a single slow run doesn't blank the UI, short
     * enough that a dead scheduler doesn't leave numbers up all day.
     */
    public const REDIS_TTL_SECONDS = 300;

    public function handle(): int
    {
        $baseUrl = rtrim((string) config('services.icecast.url'), '/');
        $adminUser = (string) config('services.icecast.admin_user');
        $adminPassword = (string) config('services.icecast.admin_password');

        if ($baseUrl === '' || $adminPassword === '') {
            $this->error('Icecast admin credentials are not configured (ICECAST_ADMIN_PASSWORD).');

            return self::FAILURE;
        }

        try {
            $response = Http::withBasicAuth($adminUser, $adminPassword)
                ->timeout(5)
                ->get($baseUrl.'/admin/stats');
        } catch (\Throwable $e) {
            // Icecast being unreachable is an infra problem, not a reason to
            // fail the scheduler loudly every minute — log and leave the
            // previous counts to expire on their own TTL.
            Log::warning('stations:sync-listeners could not reach Icecast', [
                'url' => $baseUrl,
                'error' => $e->getMessage(),
            ]);

            return self::FAILURE;
        }

        if (! $response->successful()) {
            Log::warning('stations:sync-listeners got a non-2xx from Icecast', [
                'status' => $response->status(),
            ]);

            return self::FAILURE;
        }

        $countsByMount = $this->parseMountListeners($response->body());

        $synced = 0;
        $totalListeners = 0;

        // Every station is written on every run, including the ones Icecast
        // has no source for — that's how a station that just went quiet gets
        // reset to 0 rather than keeping its last count until the TTL fires.
        foreach (Station::query()->get(['id', 'icecast_mount']) as $station) {
            $count = $countsByMount[$station->icecast_mount] ?? 0;

            Redis::setex("listeners:{$station->id}", self::REDIS_TTL_SECONDS, $count);
            $this->recordPeak($station, $count);

            $synced++;
            $totalListeners += $count;
        }

        $this->info("Synced {$synced} stations, {$totalListeners} listeners total.");

        return self::SUCCESS;
    }

    /**
     * Bump the open StreamSession's high-water mark. Scoped with a `<`
     * comparison so this is a single conditional UPDATE — no read-then-write
     * race between overlapping runs, and no write at all in the common case.
     */
    private function recordPeak(Station $station, int $count): void
    {
        if ($count <= 0) {
            return;
        }

        StreamSession::query()
            ->where('station_id', $station->id)
            ->whereNull('ended_at')
            ->where('peak_listeners', '<', $count)
            ->update(['peak_listeners' => $count]);
    }

    /**
     * Extract mount → listener count from an Icecast `/admin/stats` document:
     *
     *   <icestats>
     *     <source mount="/stream/jazz"><listeners>3</listeners></source>
     *   </icestats>
     *
     * Mounts with no <listeners> element (a source that just connected) are
     * reported as 0 rather than skipped, so they still clear any stale value.
     *
     * @return array<string, int> keyed by mount path, e.g. "/stream/jazz"
     */
    private function parseMountListeners(string $xml): array
    {
        // LIBXML_NONET blocks external entity fetches. Icecast is trusted
        // infrastructure, but this response is still parsed input and the
        // flag costs nothing.
        $parsed = @simplexml_load_string($xml, null, LIBXML_NONET);

        if ($parsed === false) {
            Log::warning('stations:sync-listeners could not parse the Icecast stats XML');

            return [];
        }

        $counts = [];

        foreach ($parsed->source as $source) {
            $mount = (string) ($source['mount'] ?? '');
            if ($mount === '') {
                continue;
            }

            $counts[$mount] = (int) ($source->listeners ?? 0);
        }

        return $counts;
    }
}
