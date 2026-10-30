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
 *   • dropListeners()  — disconnect a stopped station's audience, which the
 *                        /standby fallback would otherwise keep forever.
 *                        Every station, both paths: the fallback is on
 *                        Icecast's default mount.
 *
 * Every call is best-effort and short: a slow or absent Icecast must never
 * hold up a power button or a now-playing update.
 */
class IcecastAdmin
{
    private const TIMEOUT_SECONDS = 3;

    public const STANDBY_MOUNT = '/standby';

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

            if ($mount !== '' && $mount !== self::STANDBY_MOUNT) {
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

    /**
     * Disconnect everyone still tuned to a station that has just been turned
     * off: listeners on its mount, and listeners the default mount's fallback
     * already moved to /standby from it. Without this they sit on the shared
     * silence for good — the station page's player stops itself, but an
     * embed, VLC or a car radio never does.
     *
     * Call it after the source is gone, so nobody is moved to /standby behind
     * it. Returns how many were disconnected, or null when Icecast could not
     * be asked.
     */
    public function dropListeners(string $mount): ?int
    {
        $onMount = $this->listeners($mount);
        $onStandby = $this->standbyListeners();

        if ($onMount === null && $onStandby === null) {
            return null;
        }

        $dropped = 0;

        foreach (array_keys($onMount ?? []) as $id) {
            $dropped += (int) $this->killListener($mount, $id);
        }

        foreach ($onStandby ?? [] as $id => $origin) {
            if ($origin === $mount) {
                $dropped += (int) $this->killListener(self::STANDBY_MOUNT, $id);
            }
        }

        return $dropped;
    }

    /**
     * Listeners on /standby, keyed by Icecast's client id, each with the mount
     * they were moved from (null for one who asked for /standby directly).
     * Icecast 2.5 keeps every listener's mount history, which is what lets one
     * shared standby still be cleaned up per station.
     *
     * @return array<int, string|null>|null
     */
    public function standbyListeners(): ?array
    {
        $listeners = $this->listeners(self::STANDBY_MOUNT);

        if ($listeners === null) {
            return null;
        }

        return array_map(function (array $history): ?string {
            $origins = array_values(array_filter($history, fn (string $mount) => $mount !== self::STANDBY_MOUNT));

            return $origins === [] ? null : end($origins);
        }, $listeners);
    }

    public function killListener(string $mount, int $id): bool
    {
        // A listener who left on their own between the list and this call is
        // the outcome we wanted, not a failure.
        return $this->get('/admin/killclient', ['mount' => $mount, 'id' => (string) $id], goneIsDone: true) !== null;
    }

    /**
     * @return array<int, list<string>>|null client id => mount history, oldest first
     */
    private function listeners(string $mount): ?array
    {
        $response = $this->get('/admin/listclients', ['mount' => $mount], goneIsDone: true);

        if ($response === null) {
            return null;
        }

        // 404: no source on that mount, so nobody is listening to it.
        if ($response === '') {
            return [];
        }

        $parsed = @simplexml_load_string($response, null, LIBXML_NONET);

        if ($parsed === false) {
            Log::warning('Could not parse Icecast listclients', ['mount' => $mount]);

            return null;
        }

        $listeners = [];

        foreach ($parsed->source->listener ?? [] as $listener) {
            $history = [];

            foreach ($listener->history->mount ?? [] as $entry) {
                $history[] = (string) $entry;
            }

            $listeners[(int) $listener['id']] = $history;
        }

        return $listeners;
    }

    public function updateMetadata(Station $station, ?string $title, ?string $artist): bool
    {
        $parts = array_map(fn (?string $part) => trim((string) $part), [$artist, $title]);
        $song = implode(' - ', array_filter($parts, fn (string $part) => $part !== ''));

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
