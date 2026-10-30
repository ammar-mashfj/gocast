<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The few Icecast admin calls a relay station needs, because on that path
 * there is no container to ask or to tell.
 *
 *   • liveMounts()     — which mounts have a source right now: the authority
 *                        for "is a relay broadcaster really there?"
 *   • killSource()     — cut a relay broadcaster off (station turned off).
 *   • updateMetadata() — the title Icecast-native players (VLC, car radios)
 *                        show; the web player reads Laravel's copy instead.
 *
 * Every call is best-effort and short: a slow or absent Icecast must never
 * hold up a power button or a now-playing update.
 */
class IcecastAdmin
{
    private const TIMEOUT_SECONDS = 3;

    /**
     * Mounts that have a source connected, or null when Icecast could not be
     * asked. Null is "unknown", never "nobody": a caller deciding to close a
     * session must do nothing on null.
     *
     * The shared silence mount is left out — it is not a station.
     *
     * @return array<string, true>|null keyed by mount path
     */
    public function liveMounts(): ?array
    {
        $response = $this->get('/admin/listmounts');

        if ($response === null) {
            return null;
        }

        $parsed = @simplexml_load_string($response, null, LIBXML_NONET);

        if ($parsed === false) {
            Log::warning('Could not parse Icecast listmounts');

            return null;
        }

        $mounts = [];

        foreach ($parsed->source as $source) {
            $mount = (string) ($source['mount'] ?? '');

            if ($mount !== '' && $mount !== '/standby') {
                $mounts[$mount] = true;
            }
        }

        return $mounts;
    }

    public function killSource(Station $station): bool
    {
        // 404 is the usual answer, not a failure: End show closes the studio's
        // socket before the stop request, so the source is normally gone already.
        return $this->get('/admin/killsource', ['mount' => $station->icecast_mount], goneIsDone: true) !== null;
    }

    public function updateMetadata(Station $station, ?string $title, ?string $artist): bool
    {
        $song = trim(implode(' - ', array_filter([$artist, $title], fn ($part) => $part !== null && $part !== '')));

        return $this->get('/admin/metadata', [
            'mount' => $station->icecast_mount,
            'mode' => 'updinfo',
            'song' => $song,
            'charset' => 'UTF-8',
        ]) !== null;
    }

    /**
     * @param  array<string, string>  $query
     */
    private function get(string $path, array $query = [], bool $goneIsDone = false): ?string
    {
        $base = rtrim((string) config('services.icecast.url'), '/');
        $password = (string) config('services.icecast.admin_password');

        if ($base === '' || $password === '') {
            return null;
        }

        try {
            $response = Http::withBasicAuth((string) config('services.icecast.admin_user'), $password)
                ->timeout(self::TIMEOUT_SECONDS)
                ->get($base.$path, $query);
        } catch (Throwable $e) {
            Log::warning('Icecast admin call failed', ['path' => $path, 'error' => $e->getMessage()]);

            return null;
        }

        if ($goneIsDone && $response->notFound()) {
            return '';
        }

        if (! $response->successful()) {
            Log::warning('Icecast admin call refused', ['path' => $path, 'status' => $response->status()]);

            return null;
        }

        return $response->body();
    }
}
