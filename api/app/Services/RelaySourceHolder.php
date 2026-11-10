<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Which studio holds a relay station's Icecast source.
 *
 * A studio makes up a random id when it goes live and sends it with every
 * broadcast-token request; the token carries it. Icecast then tells us about
 * the source twice — the auth call that admits it, then the source-connect
 * event — and both carry the same Icecast `client` id. The auth call links
 * that client to the studio id, and the connect event makes it the holder.
 *
 * The point is BroadcastTokenController's cut: a studio reconnecting after
 * its network died asks for a token while Icecast still carries its dead
 * source, and only a request from the same studio may cut it. A second device
 * (or a stale tab) has a different id, cuts nothing, and is refused "already
 * live" as before. Cutting for anyone made two live devices knock each other
 * off air in a loop: each cut studio reconnects, and its token request cut
 * the other.
 *
 * Cache only, and every failure swallowed: without it a reconnect waits for
 * the relay's idle timeout, which is how it worked before this existed.
 */
class RelaySourceHolder
{
    /** An admitted login's connect event follows within moments. */
    private const LOGIN_TTL_SECONDS = 120;

    /** Cleared by the source's own disconnect; this only bounds a lost one. */
    private const HOLDER_TTL_SECONDS = 7 * 24 * 3600;

    public function admitted(Station $station, string $icecastClient, string $studio): void
    {
        $this->attempt(fn () => Cache::put(
            $this->loginKey($station, $icecastClient),
            $studio,
            self::LOGIN_TTL_SECONDS,
        ));
    }

    /**
     * The source Icecast just connected: record its studio as the holder.
     *
     * @return string|null The studio that holds the source, when known.
     */
    public function connected(Station $station, string $icecastClient): ?string
    {
        return $this->attempt(function () use ($station, $icecastClient): ?string {
            $studio = Cache::pull($this->loginKey($station, $icecastClient));

            if (! is_string($studio)) {
                Cache::forget($this->holderKey($station));

                return null;
            }

            Cache::put($this->holderKey($station), [
                'studio' => $studio,
                'client' => $icecastClient,
            ], self::HOLDER_TTL_SECONDS);

            return $studio;
        });
    }

    /**
     * A source left. Only its own disconnect clears the holder: the dead
     * source a reconnect cut reports its disconnect after the new one may
     * already hold the mount.
     */
    public function disconnected(Station $station, string $icecastClient): void
    {
        $this->attempt(function () use ($station, $icecastClient): void {
            $holder = Cache::get($this->holderKey($station));

            if (is_array($holder) && ($holder['client'] ?? null) === $icecastClient) {
                Cache::forget($this->holderKey($station));
            }
        });
    }

    public function holds(Station $station, string $studio): bool
    {
        return $this->attempt(fn (): bool => (Cache::get($this->holderKey($station))['studio'] ?? null) === $studio) ?? false;
    }

    private function loginKey(Station $station, string $icecastClient): string
    {
        return "relay-login:{$station->id}:{$icecastClient}";
    }

    private function holderKey(Station $station): string
    {
        return "relay-holder:{$station->id}";
    }

    /**
     * @template T
     *
     * @param  \Closure(): T  $callback
     * @return T|null
     */
    private function attempt(\Closure $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable $e) {
            Log::warning('Relay source holder unavailable', ['error' => $e->getMessage()]);

            return null;
        }
    }
}
