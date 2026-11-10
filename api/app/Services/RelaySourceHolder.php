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
 * source, and only a request from the same studio may cut it. The connect
 * event also names the source itself (`source-instance`, new for every
 * source), so the cut can check with Icecast that the source on the mount
 * is still that one: this record can be behind, and the mount may already
 * belong to another device whose own connect has not been processed yet. A second device
 * (or a stale tab) has a different id, cuts nothing, and is refused "already
 * live" as before. Cutting for anyone made two live devices knock each other
 * off air in a loop: each cut studio reconnects, and its token request cut
 * the other.
 *
 * This relies on WHEN the studio asks for a token: only right before a new
 * connection (connectWebcast(), from Go Live and the reconnect loop), never
 * while its own socket is still live. A token request from a live studio —
 * a token refresh mid-show, say — would cut its own healthy source and take
 * the show off air. Anything that asks for a token outside a connect must
 * send no studio id.
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
    public function connected(Station $station, string $icecastClient, ?string $sourceInstance = null): ?string
    {
        return $this->attempt(function () use ($station, $icecastClient, $sourceInstance): ?string {
            $studio = Cache::pull($this->loginKey($station, $icecastClient));

            if (! is_string($studio)) {
                Cache::forget($this->holderKey($station));

                return null;
            }

            Cache::put($this->holderKey($station), [
                'studio' => $studio,
                'client' => $icecastClient,
                'instance' => $sourceInstance,
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

    /**
     * The studio whose source Icecast is carrying on this station's mount:
     * the holder on record, only when its source is the one on the mount
     * ($onMount, from IcecastAdmin::sourceInstance()). A record that is
     * behind the mount names nobody.
     */
    public function confirmedStudio(Station $station, ?string $onMount): ?string
    {
        if ($onMount === null) {
            return null;
        }

        return $this->attempt(function () use ($station, $onMount): ?string {
            $holder = Cache::get($this->holderKey($station));

            return is_array($holder)
                && ($holder['instance'] ?? null) === $onMount
                && is_string($holder['studio'] ?? null)
                ? $holder['studio']
                : null;
        });
    }

    /**
     * The Icecast source this studio holds, by its `source-instance`: null
     * when the studio holds none, or when its connect event did not name the
     * source (nothing to check the mount against, so nothing to cut).
     */
    public function heldSource(Station $station, string $studio): ?string
    {
        return $this->attempt(function () use ($station, $studio): ?string {
            $holder = Cache::get($this->holderKey($station));

            if (! is_array($holder) || ($holder['studio'] ?? null) !== $studio) {
                return null;
            }

            $instance = $holder['instance'] ?? null;

            return is_string($instance) && $instance !== '' ? $instance : null;
        });
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
