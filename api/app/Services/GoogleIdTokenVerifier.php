<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
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
     * Decode against the cached key set, refetching it once if the token was
     * signed with a key we have not seen yet (Google rotates them).
     *
     * @return array<string, mixed>
     */
    private function decode(string $idToken): array
    {
        JWT::$leeway = 60;

        try {
            return (array) JWT::decode($idToken, JWK::parseKeySet($this->keys()));
        } catch (Throwable $first) {
            Cache::forget(self::JWKS_CACHE_KEY);

            try {
                return (array) JWT::decode($idToken, JWK::parseKeySet($this->keys()));
            } catch (Throwable $e) {
                throw new InvalidGoogleIdToken($e->getMessage(), previous: $e);
            }
        }
    }

    /**
     * @return array{keys: array<int, array<string, string>>}
     */
    private function keys(): array
    {
        return Cache::remember(self::JWKS_CACHE_KEY, now()->addHour(), function (): array {
            try {
                return Http::timeout(5)->get(self::JWKS_URL)->throw()->json();
            } catch (Throwable $e) {
                throw new InvalidGoogleIdToken('Could not fetch Google signing keys.', previous: $e);
            }
        });
    }
}
