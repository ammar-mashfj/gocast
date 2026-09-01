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
     * fifty stations doesn't open fifty sockets per request. A confirmed-down
     * container is held far longer; see {@see self::ttlFor()}.
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
     * @return array{ready: bool, icecast: ?bool, source: string, broadcaster: ?bool, rms: ?float, title: ?string, artist: ?string, elapsed: ?float, remaining: ?float, playlist_length: ?int, up_next: list<string>}|null
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
        $key = self::CACHE_PREFIX.$station->id;

        $cached = Cache::get($key);

        if (is_array($cached)) {
            return $cached;
        }

        $payload = $this->pull($station);

        Cache::put($key, $payload, $this->ttlFor($payload));

        return $payload;
    }

    /**
     * How long this answer stays true.
     *
     * A container that replied carries a playback position, so it goes stale
     * within seconds. "The container is gone" does not: nothing short of an
     * explicit start can change it, and every power transition already calls
     * {@see self::forget()}. Re-deriving it on the normal TTL meant every
     * viewer of a stopped station re-ran the whole probe twice a poll cycle
     * to be told the same thing.
     *
     * Only a verdict Docker actually confirmed gets the long TTL. An
     * unreachable harbor on a container Docker says is UP is a booting or
     * wedged station — genuinely worth re-asking at the short interval.
     *
     * @param  array<string, mixed>  $payload
     */
    private function ttlFor(array $payload): int
    {
        $confirmedDown = ($payload['reachable'] ?? false) === false
            && ($payload['container_up'] ?? true) === false;

        return $confirmedDown
            ? (int) config('liquidsoap.status_down_ttl_seconds', 15)
            : (int) config('liquidsoap.status_ttl_seconds', 2);
    }

    /**
     * The same answer as {@see self::fetch()}, but never from the cache.
     *
     * For the auto-stop decision, which must not conclude "silent" from a
     * reading taken before the moment it is reasoning about. The two-second
     * TTL exists so that rendering a page of fifty stations does not open
     * fifty sockets; a once-a-minute sweep has the opposite requirement and
     * would rather pay for the socket.
     *
     * The fresh answer is written back to the cache, so a dashboard request
     * arriving just behind the sweep is served the newer reading rather than
     * opening a second connection to the same container.
     *
     * @return array<string, mixed>|null
     */
    public function pullFresh(Station $station): ?array
    {
        if (! $station->isRunning()) {
            return null;
        }

        $payload = $this->pull($station);

        Cache::put(
            self::CACHE_PREFIX.$station->id,
            $payload,
            (int) config('liquidsoap.status_ttl_seconds', 2),
        );

        return ($payload['reachable'] ?? false) ? $payload['status'] : null;
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
        $port = (int) config('liquidsoap.harbor_port', 8080);

        // Ask Docker BEFORE harbor. containerHost() is pure arithmetic — it
        // derives an address from the station's container_index and never
        // consults Docker — so once a container is gone we are dialling an IP
        // that nothing holds. The bridge drops those packets silently instead
        // of refusing them, so the connect does not fail fast: it burns the
        // entire harbor timeout to discover what a local `docker inspect`
        // answers in milliseconds. Measured on the dev box: 1.5s versus 23ms.
        //
        // This reorders cost, not meaning. Every case that reaches harbor with
        // a dead container already ended up here via the catch below, with the
        // same verdict; it just paid the timeout first. A container Docker
        // reports as 'restarting' or 'absent' likewise resolved to the same
        // answer the long way round.
        //
        // probeContainer() returns true when DOCKER is unreachable — a fault
        // in our tooling is not evidence about the station — so a Docker
        // outage falls through to harbor exactly as before rather than
        // reporting every station offline.
        if (! $this->probeContainer($station)) {
            return ['reachable' => false, 'status' => null, 'container_up' => false];
        }

        try {
            // Inside the try on purpose. containerHost() can throw — the
            // address space can be exhausted, or the subnet can be
            // misconfigured — and it used to sit outside, so the one case
            // state() is written to handle gracefully (container gone, report
            // offline, owner presses start) surfaced as a 500 instead.
            $host = $this->supervisor->containerHost($station);

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
     * Is the station's container actually up?
     *
     * Consulted BEFORE harbor, and again if harbor answers unsuccessfully.
     * It used to run only on the failure path, to keep Docker off the healthy
     * one — but that traded a cheap local call for the risk of a very
     * expensive remote one, since harbor's address is computed rather than
     * discovered and a stale address costs the full timeout. An inspect is
     * local and sub-50ms; the harbor dial it can pre-empt is 1.5s.
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
            // Is a broadcaster attached, muted or not? Null on containers that
            // predate the field. Same convention as `icecast`, and it matters
            // more here: anything deciding whether to STOP a station must read
            // null as "unknown, do not act", never as "nobody is here".
            'broadcaster' => array_key_exists('broadcaster', $json) ? (bool) $json['broadcaster'] : null,
            // Output level, 0.0–1.0. The ground truth for "is this station
            // actually producing sound", independent of which arm won the
            // fallback. Null when unreported — again, unknown, not silent.
            //
            // 0.0 is a legitimate value, so this cannot reuse the $seconds
            // helper, which maps anything non-positive to null.
            'rms' => is_numeric($json['rms'] ?? null) ? round((float) $json['rms'], 4) : null,
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
