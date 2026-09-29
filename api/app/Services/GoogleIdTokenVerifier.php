<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * Verifies the ID token the mobile app gets from Android's "Sign in with
 * Google" sheet, locally, against Google's published signing keys.
 *
 * The token is only proof of identity if all of this holds: Google signed it
 * (RS256, key from the JWKS), it has not expired, Google issued it, it was
 * issued for OUR web client (`aud`, the client the app passes as its server
 * client ID), and Google has verified the email. The audience check is the
 * one that matters most: without it, an ID token minted for any other app
 * would sign its holder in here.
 */
class GoogleIdTokenVerifier
{
    public const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

    private const JWKS_CACHE_KEY = 'google-id-token-jwks';

    private const JWKS_REFETCH_KEY = 'google-id-token-jwks-refetched';

    /** Refetches allowed per minute across all key IDs. */
    private const JWKS_REFETCHES_PER_MINUTE = 10;

    private const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

    /**
     * @return array{sub: string, email: string, name: string|null, picture: string|null}
     *
     * @throws InvalidGoogleIdToken
     */
    public function verify(string $idToken): array
    {
        $claims = $this->decode($idToken);

        if (! in_array($claims['iss'] ?? null, self::ISSUERS, true)) {
            throw new InvalidGoogleIdToken('Unexpected issuer.');
        }

        $audience = (string) config('services.google.client_id');

        if ($audience === '' || ($claims['aud'] ?? null) !== $audience) {
            throw new InvalidGoogleIdToken('Token was issued for another client.');
        }

        if (($claims['email_verified'] ?? false) !== true || empty($claims['email']) || empty($claims['sub'])) {
            throw new InvalidGoogleIdToken('Token has no verified email.');
        }

        return [
            'sub' => (string) $claims['sub'],
            'email' => (string) $claims['email'],
            'name' => isset($claims['name']) ? (string) $claims['name'] : null,
            'picture' => isset($claims['picture']) ? (string) $claims['picture'] : null,
        ];
    }

    /**
     * Decode against the cached key set. Google rotates its keys, so a token
     * signed with a `kid` we have not cached triggers one refetch, and only
     * that: junk, expired or badly signed tokens must not cost an outbound
     * call or evict a good key set. Refetches are limited per key ID (once a
     * minute) and overall (a few a minute), so tokens with made-up key IDs
     * cannot turn into a stream of requests to Google. The per-kid limit is
     * what keeps a forged kid from spending the refetch a genuinely new key
     * needs: it only ever blocks retries of itself.
     *
     * @return array<string, mixed>
     */
    private function decode(string $idToken): array
    {
        JWT::$leeway = 60;

        try {
            $keys = $this->keys();

            $kid = $this->unknownKid($idToken, $keys);

            if ($kid !== null && $this->mayRefetch($kid)) {
                $keys = $this->refetchKeys($kid);
            }

            return (array) JWT::decode($idToken, JWK::parseKeySet($keys));
        } catch (InvalidGoogleIdToken $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new InvalidGoogleIdToken($e->getMessage(), previous: $e);
        }
    }

    /**
     * The token's `kid` if it names a key missing from the cached set.
     *
     * @param  array{keys: array<int, array<string, string>>}  $keys
     */
    private function unknownKid(string $idToken, array $keys): ?string
    {
        $header = json_decode(JWT::urlsafeB64Decode(explode('.', $idToken)[0]), true);
        $kid = is_array($header) ? ($header['kid'] ?? null) : null;

        if (! is_string($kid) || in_array($kid, array_column($keys['keys'] ?? [], 'kid'), true)) {
            return null;
        }

        return $kid;
    }

    /**
     * Once a minute per key ID, and at most JWKS_REFETCHES_PER_MINUTE across
     * all of them. The per-key marker is claimed first so a repeat of the same
     * made-up key ID spends nothing from the shared budget; when the shared
     * budget is out, the marker is given back, or a genuinely new Google key
     * would stay locked out for a minute after the flood ended.
     */
    private function mayRefetch(string $kid): bool
    {
        if (! Cache::add(self::JWKS_REFETCH_KEY.':'.sha1($kid), true, 60)) {
            return false;
        }

        if (RateLimiter::attempt(self::JWKS_REFETCH_KEY, self::JWKS_REFETCHES_PER_MINUTE, fn () => true, 60)) {
            return true;
        }

        Cache::forget(self::JWKS_REFETCH_KEY.':'.sha1($kid));

        return false;
    }

    /**
     * @return array{keys: array<int, array<string, string>>}
     */
    private function keys(): array
    {
        return Cache::remember(self::JWKS_CACHE_KEY, now()->addHour(), fn (): array => $this->fetchKeys());
    }

    /**
     * Replace the cached set with a fresh one. The cached set stays until
     * the new one is in hand: dropping it first would turn a Google outage
     * into every sign-in failing until the outage ends. A failed fetch also
     * gives the key ID its refetch back, and the shared budget its attempt,
     * since neither was used.
     *
     * @return array{keys: array<int, array<string, string>>}
     */
    private function refetchKeys(string $kid): array
    {
        try {
            $keys = $this->fetchKeys();
        } catch (InvalidGoogleIdToken $e) {
            Cache::forget(self::JWKS_REFETCH_KEY.':'.sha1($kid));
            RateLimiter::decrement(self::JWKS_REFETCH_KEY);

            throw $e;
        }

        Cache::put(self::JWKS_CACHE_KEY, $keys, now()->addHour());

        return $keys;
    }

    /**
     * @return array{keys: array<int, array<string, string>>}
     */
    private function fetchKeys(): array
    {
        try {
            return Http::timeout(5)->get(self::JWKS_URL)->throw()->json();
        } catch (Throwable $e) {
            throw new InvalidGoogleIdToken('Could not fetch Google signing keys.', previous: $e);
        }
    }
}
