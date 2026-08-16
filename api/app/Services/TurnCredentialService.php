<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Issues the ICE server list the browser uses to reach MediaMTX.
 *
 * STUN alone only helps peers that can already exchange UDP directly. A
 * broadcaster behind a VPN with "WebRTC leak protection", a firewall that
 * blocks UDP, or symmetric NAT gathers no usable candidate pair, so the WHIP
 * handshake succeeds (201) and the connection then never forms. TURN fixes
 * that by relaying the media through a server the browser *can* reach —
 * including over TLS on 443, which is what Chrome's `disable_non_proxied_udp`
 * policy deliberately leaves open.
 *
 * Credentials are minted here rather than baked into the client because the
 * TURN key is a long-lived secret: shipped to the browser it would be scraped
 * and someone else's traffic would burn the quota. Cloudflare hands back
 * short-lived username/credential pairs instead, which are safe to expose.
 *
 * Degrades rather than fails. If TURN is unconfigured or Cloudflare is
 * unreachable, callers get the STUN-only list — the app's behaviour before TURN
 * existed. A broadcaster who did not need a relay is unaffected; one who did
 * gets the same failure they would have got anyway, and the client now names
 * the likely cause.
 */
class TurnCredentialService
{
    /**
     * Free, unlimited, and operated by the same provider as the TURN relay.
     * Google's is kept alongside it so a Cloudflare outage cannot take
     * candidate gathering down with it.
     *
     * @var list<array{urls: string}>
     */
    private const FALLBACK_STUN = [
        ['urls' => 'stun:stun.cloudflare.com:3478'],
        ['urls' => 'stun:stun.l.google.com:19302'],
    ];

    private const ENDPOINT = 'https://rtc.live.cloudflare.com/v1/turn/keys/%s/credentials/generate-ice-servers';

    private const CACHE_KEY = 'cloudflare-turn-ice-servers';

    /**
     * ICE servers for a broadcaster, ready to hand to RTCPeerConnection.
     *
     * @return list<array<string, mixed>>
     */
    public function iceServers(): array
    {
        $keyId = (string) config('services.cloudflare_turn.key_id');
        $apiToken = (string) config('services.cloudflare_turn.api_token');

        if ($keyId === '' || $apiToken === '') {
            return self::FALLBACK_STUN;
        }

        $ttl = max(60, (int) config('services.cloudflare_turn.ttl', 3600));

        // Cached for well under the credential lifetime so every broadcaster
        // in a burst shares one API call, while no cached credential is ever
        // handed out close to its expiry. A relay allocation outlives the
        // credential that opened it, so reuse costs nothing.
        $cached = Cache::remember(
            self::CACHE_KEY,
            (int) floor($ttl / 2),
            fn () => $this->fetch($keyId, $apiToken, $ttl),
        );

        // Never cache a failure: a transient outage would otherwise strand
        // every broadcaster on STUN for the rest of the cache window.
        if ($cached === null) {
            Cache::forget(self::CACHE_KEY);

            return self::FALLBACK_STUN;
        }

        return $cached;
    }

    /**
     * @return list<array<string, mixed>>|null Null when Cloudflare could not be reached.
     */
    private function fetch(string $keyId, string $apiToken, int $ttl): ?array
    {
        try {
            $response = Http::withToken($apiToken)
                ->timeout(4)
                ->post(sprintf(self::ENDPOINT, $keyId), ['ttl' => $ttl]);

            if (! $response->successful()) {
                Log::warning('Cloudflare TURN credential request failed', [
                    'status' => $response->status(),
                    'body' => mb_substr($response->body(), 0, 200),
                ]);

                return null;
            }

            // Response shape: {"iceServers": {"urls": [...], "username": "...",
            // "credential": "..."}}. RTCPeerConnection accepts that object as
            // a single entry, so it is passed through rather than reshaped —
            // less to break if Cloudflare adds fields.
            $iceServers = $response->json('iceServers');

            if (! is_array($iceServers) || $iceServers === []) {
                Log::warning('Cloudflare TURN returned no ICE servers');

                return null;
            }

            // A bare object means one server; a list means several.
            $servers = array_is_list($iceServers) ? $iceServers : [$iceServers];

            // STUN stays appended so candidate gathering still works if the
            // relay itself is unreachable from the broadcaster's network.
            return array_merge(array_values($servers), self::FALLBACK_STUN);
        } catch (Throwable $e) {
            Log::warning('Cloudflare TURN unreachable', ['error' => $e->getMessage()]);

            return null;
        }
    }
}
