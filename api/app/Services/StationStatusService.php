<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Reads live audio state straight from a station's Liquidsoap container.
 *
 * Liquidsoap is the only component that knows what is actually on air: which
 * source won the fallback, what metadata is attached to it, how far into the
 * track we are, what the playlist will play next. Everything Laravel stores
 * about that is a cache of an answer the container can give directly, so this
 * service pulls it over harbor HTTP (see the control-surface block in
 * resources/views/liquidsoap/station.blade.php) instead of waiting to be told.
 *
 * "Unreachable" is a meaningful answer, not an error: a stopped station has
 * no container, which is exactly what offline means. Callers get null and
 * render the station as offline.
 *
 * The push in the other direction (on_metadata → /api/internal/now-playing)
 * stays: it updates the cached metadata the instant a track changes, without
 * anybody polling. This service is the authority the push is reconciled
 * against, not a replacement for it.
 */
class StationStatusService
{
    /**
     * Cache key prefix for a pulled status. Short TTL — this carries a
     * playback position — but non-zero, so rendering a discover page with
     * fifty stations doesn't open fifty sockets per request.
     */
    private const CACHE_PREFIX = 'station-status:';

    /**
     * Nothing is on air: either the owner never started this station, or the
     * container it should have is gone. Both are the same answer to a
     * listener, and the same fix for an owner — press start.
     */
    public const STATE_OFFLINE = 'offline';

    /** The container is up, but hasn't finished building its audio graph. */
    public const STATE_STARTING = 'starting';

    /** On air, playing the AutoDJ playlist (or silence behind an empty one). */
    public const STATE_ON_AIR = 'on_air';

    /** On air with a broadcaster publishing — live takes the fallback. */
    public const STATE_LIVE = 'live';

    /**
     * Producing audio, but Icecast is not carrying it — a rejected source
     * (wrong password), an Icecast restart, a network partition.
     *
     * This used to be indistinguishable from `on_air`: `ready` only ever meant
     * "the audio graph produces frames", so a station whose mount did not exist
     * reported itself as on air while no listener could hear a thing. The
     * container now reports the Icecast connection separately.
     */
    public const STATE_DEGRADED = 'degraded';

    public function __construct(
        private readonly LiquidsoapSupervisor $supervisor,
    ) {}

    /**
     * Current audio state, or null when the station has no reachable
     * container (stopped, still booting, or crashed).
     *
     * @return array{ready: bool, source: string, title: ?string, artist: ?string, elapsed: ?float, remaining: ?float, playlist_length: ?int, up_next: list<string>}|null
     */
    public function fetch(Station $station): ?array
    {
        // A station the owner has not started has no container by definition;
        // don't spend a socket to discover that.
        if (! $station->isRunning()) {
            return null;
        }

        $payload = $this->payload($station);

        return ($payload['reachable'] ?? false) ? $payload['status'] : null;
    }

    /**
     * The whole cached answer — the harbor status plus what Docker said about
     * the container when harbor didn't reply. One cache entry covers both, so
     * a failing station costs the same number of round trips as a healthy one.
     *
     * @return array{reachable: bool, status: array<string, mixed>|null, container_up?: bool}
     */
    private function payload(Station $station): array
    {
        return Cache::remember(
            self::CACHE_PREFIX.$station->id,
            (int) config('liquidsoap.status_ttl_seconds', 2),
            fn () => $this->pull($station),
        );
    }

    /**
     * Is the container up AND actually producing audio? This is the check
     * the broadcast pre-flight waits on: `docker ps` reports the process,
     * not whether the audio graph came together and connected to Icecast.
     */
    public function isReady(Station $station): bool
    {
        return (bool) ($this->fetch($station)['ready'] ?? false);
    }

    /**
     * The single user-facing state, derived from intent plus what the
     * container reports. Pass an already-fetched status to avoid a second
     * read; omit it and the status is pulled.
     *
     * "starting" used to cover both a container building its audio graph and
     * one that had died, on the grounds that they look identical from outside.
     * They don't: Docker can tell them apart, and conflating them meant a
     * station that would never come up showed "starting" forever — including
     * after the reconciler hit its recreate cap and deliberately gave up.
     * A container that is gone reads as offline, which is both true and
     * actionable: the owner presses start.
     *
     * @param  array<string, mixed>|null  $status
     */
    public function state(Station $station, ?array $status = null): string
    {
        if (! $station->isRunning()) {
            return self::STATE_OFFLINE;
        }

        $status ??= $this->fetch($station);

        // No answer at all. The container is either still coming up or it
        // isn't there — only Docker knows which, and the two deserve
        // different words.
        if ($status === null) {
            return $this->containerIsUp($station)
                ? self::STATE_STARTING
                : self::STATE_OFFLINE;
        }

        // It answered and said it isn't ready yet, which is precisely what
        // booting looks like. No need to ask Docker.
        if (! ($status['ready'] ?? false)) {
            return self::STATE_STARTING;
        }

        // Ready but not carried. Reported after readiness rather than instead
        // of it, because the audio graph really is fine — what failed is the
        // hop to the listener, and saying "starting" would send an operator
        // looking in the wrong place.
        //
        // Containers predating the icecast field report null; absent evidence
        // of a problem, trust the old behaviour rather than marking every
        // station degraded mid-rollout.
        if (($status['icecast'] ?? true) === false) {
            return self::STATE_DEGRADED;
        }

        return ($status['source'] ?? null) === 'live'
            ? self::STATE_LIVE
            : self::STATE_ON_AIR;
    }

    /**
     * Drop the cached status — call after a transition (start/stop/skip) so
     * the next read reflects the new reality instead of a stale two seconds.
     */
    public function forget(Station $station): void
    {
        Cache::forget(self::CACHE_PREFIX.$station->id);
    }

    /**
     * @return array{reachable: bool, status: array<string, mixed>|null}
     */
    private function pull(Station $station): array
    {
        $host = $this->supervisor->containerHost($station);
        $port = (int) config('liquidsoap.harbor_port', 8080);

        try {
            $response = Http::withHeaders([
                'X-Internal-Key' => (string) config('services.internal_api_key'),
            ])
                ->timeout((float) config('liquidsoap.harbor_timeout', 1.5))
                ->get("http://{$host}:{$port}/status");

            if (! $response->successful()) {
                return [
                    'reachable' => false,
                    'status' => null,
                    'container_up' => $this->probeContainer($station),
                ];
            }

            return ['reachable' => true, 'status' => $this->normalize($response->json())];
        } catch (Throwable $e) {
            // Expected whenever a station is booting or has just been
            // stopped — info, not error, so it doesn't drown the logs.
            Log::info('Station status unreachable', [
                'station' => $station->slug,
                'error' => $e->getMessage(),
            ]);

            return [
                'reachable' => false,
                'status' => null,
                'container_up' => $this->probeContainer($station),
            ];
        }
    }

    /**
     * Is the station's container actually up? Only consulted when harbor did
     * not answer, so the cost lands on the failure path and never on a healthy
     * station.
     *
     * Deliberately reads `containerState()` rather than the supervisor's
     * `isRunning()`: `restarting` — a container crash-looping on a broken
     * script — must not read as up, and `containerState()` is the method that
     * reports it (see the note on LiquidsoapSupervisor::isRunning).
     */
    private function probeContainer(Station $station): bool
    {
        try {
            $name = $this->supervisor->containerName($station);

            return $this->supervisor->containerState($name)['status'] === 'running';
        } catch (Throwable $e) {
            // Docker itself is unreachable. That is a fault in our tooling,
            // not evidence about the station — don't turn it into "offline"
            // and send an owner chasing a station that is on air.
            Log::warning('Could not ask Docker about a station container', [
                'station' => $station->slug,
                'error' => $e->getMessage(),
            ]);

            return true;
        }
    }

    /**
     * Cached verdict on the container, for callers that already know harbor
     * is silent. Absent from the payload when harbor answered — in which case
     * the container is trivially up.
     */
    private function containerIsUp(Station $station): bool
    {
        return (bool) ($this->payload($station)['container_up'] ?? true);
    }

    /**
     * Coerce harbor's JSON into a stable shape. Liquidsoap reports an empty
     * string for absent metadata and -1 for an unknown remaining time; both
     * become null so the API never surfaces a magic value.
     *
     * @param  mixed  $json
     * @return array<string, mixed>
     */
    private function normalize($json): array
    {
        $json = is_array($json) ? $json : [];

        $text = function (string $key) use ($json): ?string {
            $value = trim((string) ($json[$key] ?? ''));

            return $value === '' ? null : $value;
        };

        $seconds = function (string $key) use ($json): ?float {
            $value = $json[$key] ?? null;

            return is_numeric($value) && $value >= 0 ? round((float) $value, 1) : null;
        };

        return [
            'ready' => (bool) ($json['ready'] ?? false),
            // Null rather than false when the container does not report it:
            // "we don't know" and "not connected" are different answers, and
            // only the second one is a fault.
            'icecast' => array_key_exists('icecast', $json) ? (bool) $json['icecast'] : null,
            'source' => (string) ($json['source'] ?? 'silence'),
            'title' => $text('title'),
            'artist' => $text('artist'),
            'elapsed' => $seconds('elapsed'),
            'remaining' => $seconds('remaining'),
            'playlist_length' => isset($json['playlist_length']) ? (int) $json['playlist_length'] : null,
            'up_next' => array_values(array_filter(
                (array) ($json['up_next'] ?? []),
                fn ($entry) => is_string($entry) && $entry !== '',
            )),
        ];
    }
}
