<?php

namespace App\Services;

use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Mints + verifies short-lived broadcaster tokens for webcast publishes into
 * a station's Liquidsoap harbor input. The studio sends one as the `password`
 * of its webcast hello frame; harbor's auth callback hands it to
 * HarborAuthController, which verifies it here.
 *
 * Replaces the prior model of mirroring the Sanctum auth token into the
 * publish URL — that exposed a long-lived bearer (good for the whole API) to
 * anything downstream of the request: access logs, reverse-proxy logs, browser
 * history, error reporters. These tokens are:
 *
 *   • Scoped — usable only for one specific station.
 *   • Ephemeral — 60-second default TTL, just enough for the handshake.
 *   • Self-contained — no DB hit on validation; MAC-only.
 *
 * Format: base64url(payload).base64url(hmac), where payload is a tiny JSON
 * object {u: user_id, s: station_slug, e: unix_expiry}. Signed with APP_KEY.
 */
class BroadcastTokenService
{
    public const TTL_SECONDS = 60;

    /**
     * Issue a token for $user to publish to $station. The token is valid
     * only for that station + that user, and only for TTL_SECONDS.
     */
    public function issue(User $user, Station $station, ?int $ttlSeconds = null): string
    {
        $ttl = $ttlSeconds ?? self::TTL_SECONDS;
        $payload = json_encode([
            'u' => $user->id,
            's' => $station->slug,
            'e' => Carbon::now()->getTimestamp() + $ttl,
        ], JSON_UNESCAPED_SLASHES);

        $encodedPayload = $this->base64UrlEncode($payload);
        $signature = $this->base64UrlEncode($this->mac($encodedPayload));

        return $encodedPayload.'.'.$signature;
    }

    /**
     * Verify a token. Returns ['user_id' => ..., 'station_slug' => ...] on
     * success, null on any failure (expired, malformed, bad signature,
     * unknown station, station/user mismatch).
     *
     * Constant-time MAC comparison via hash_equals to avoid timing oracles.
     *
     * @return array{user_id: string, station_slug: string}|null
     */
    public function verify(string $token, string $expectedStationSlug): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }

        [$encodedPayload, $providedSignature] = $parts;

        $expectedSignature = $this->base64UrlEncode($this->mac($encodedPayload));
        if (! hash_equals($expectedSignature, $providedSignature)) {
            return null;
        }

        $payloadJson = $this->base64UrlDecode($encodedPayload);
        if ($payloadJson === null) {
            return null;
        }

        $payload = json_decode($payloadJson, true);
        if (! is_array($payload) || ! isset($payload['u'], $payload['s'], $payload['e'])) {
            return null;
        }

        if ($payload['s'] !== $expectedStationSlug) {
            Log::info('Broadcast token station mismatch', [
                'token_slug' => $payload['s'],
                'expected' => $expectedStationSlug,
            ]);

            return null;
        }

        if (Carbon::now()->getTimestamp() > (int) $payload['e']) {
            return null;
        }

        return [
            'user_id' => (string) $payload['u'],
            'station_slug' => (string) $payload['s'],
        ];
    }

    private function mac(string $value): string
    {
        return hash_hmac('sha256', $value, $this->signingKey(), binary: true);
    }

    /**
     * Use the Laravel app key as the signing secret. It's already required,
     * already rotated when the operator regenerates it, and binding to it
     * means tokens self-invalidate on `php artisan key:generate`.
     */
    private function signingKey(): string
    {
        $key = config('app.key');
        if (! is_string($key) || $key === '') {
            throw new \RuntimeException('APP_KEY is not configured.');
        }

        // Laravel stores APP_KEY as "base64:<raw>"; decode if present.
        if (str_starts_with($key, 'base64:')) {
            $decoded = base64_decode(substr($key, 7), strict: true);
            if ($decoded === false) {
                throw new \RuntimeException('APP_KEY is not a valid base64 string');
            }

            return $decoded;
        }

        return $key;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): ?string
    {
        $padded = strtr($value, '-_', '+/');
        $padded .= str_repeat('=', (4 - strlen($padded) % 4) % 4);
        $decoded = base64_decode($padded, strict: true);

        return $decoded === false ? null : $decoded;
    }
}
