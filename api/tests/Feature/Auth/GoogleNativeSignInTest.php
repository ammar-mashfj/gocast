<?php

use App\Models\Invite;
use App\Models\User;
use App\Services\GoogleIdTokenVerifier;
use App\Services\InvalidGoogleIdToken;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

/*
 * The mobile app's "Sign in with Google": Android's Credential Manager sheet
 * hands the app a Google ID token, and POST /auth/google/native swaps it for
 * a Sanctum token.
 */

const NATIVE_CLIENT_ID = 'web-client.apps.googleusercontent.com';

beforeEach(function () {
    config()->set('services.google.client_id', NATIVE_CLIENT_ID);
    Notification::fake();
    Cache::flush();
});

/**
 * A fresh RSA key pair and the JWKS Google would publish for it.
 *
 * @return array{0: string, 1: array<string, mixed>}
 */
function googleSigningKey(string $kid = 'kid-1'): array
{
    $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    openssl_pkey_export($key, $private);
    $rsa = openssl_pkey_get_details($key)['rsa'];
    $b64 = fn (string $bin) => rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');

    return [$private, ['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => $kid, 'n' => $b64($rsa['n']), 'e' => $b64($rsa['e'])]];
}

function googleIdToken(string $privateKey, array $overrides = [], string $kid = 'kid-1'): string
{
    return JWT::encode(array_merge([
        'iss' => 'https://accounts.google.com',
        'aud' => NATIVE_CLIENT_ID,
        'sub' => 'g-native-1',
        'email' => 'native@test.test',
        'email_verified' => true,
        'name' => 'Native User',
        'picture' => 'https://example.com/p.png',
        'iat' => time(),
        'exp' => time() + 3600,
    ], $overrides), $privateKey, 'RS256', $kid);
}

describe('GoogleIdTokenVerifier', function () {
    beforeEach(function () {
        [$this->private, $this->jwk] = googleSigningKey();
    });

    function publishKeys(array ...$jwks): void
    {
        Http::fake([GoogleIdTokenVerifier::JWKS_URL => Http::response(['keys' => $jwks])]);
    }

    it('accepts a token Google signed for our client', function () {
        publishKeys($this->jwk);
        $claims = app(GoogleIdTokenVerifier::class)->verify(googleIdToken($this->private));

        expect($claims)->toBe([
            'sub' => 'g-native-1',
            'email' => 'native@test.test',
            'name' => 'Native User',
            'picture' => 'https://example.com/p.png',
        ]);
    });

    it('rejects a token that fails a claim check', function (array $overrides) {
        publishKeys($this->jwk);
        app(GoogleIdTokenVerifier::class)->verify(googleIdToken($this->private, $overrides));
    })->throws(InvalidGoogleIdToken::class)->with([
        'issued for another app' => [['aud' => 'someone-else.apps.googleusercontent.com']],
        'not issued by Google' => [['iss' => 'https://evil.example']],
        'expired' => [['iat' => time() - 7200, 'exp' => time() - 3600]],
        'unverified email' => [['email_verified' => false]],
    ]);

    it('rejects a token signed with a key Google did not publish', function () {
        publishKeys($this->jwk);
        [$forger] = googleSigningKey();

        app(GoogleIdTokenVerifier::class)->verify(googleIdToken($forger));
    })->throws(InvalidGoogleIdToken::class);

    it('refetches the key set once when Google has rotated its keys', function () {
        [$newPrivate, $newJwk] = googleSigningKey('kid-2');
        Cache::put('google-id-token-jwks', ['keys' => [$this->jwk]], now()->addHour());
        publishKeys($newJwk);

        $claims = app(GoogleIdTokenVerifier::class)->verify(googleIdToken($newPrivate, kid: 'kid-2'));

        expect($claims['sub'])->toBe('g-native-1');
    });

    it('does not refetch the key set for a token that is bad for any other reason', function (string $token) {
        Cache::put('google-id-token-jwks', ['keys' => [$this->jwk]], now()->addHour());
        Http::fake();

        try {
            app(GoogleIdTokenVerifier::class)->verify($token);
        } catch (InvalidGoogleIdToken) {
        }

        Http::assertNothingSent();
        expect(Cache::has('google-id-token-jwks'))->toBeTrue();
    })->with([
        'garbage' => ['not-a-jwt'],
        'expired' => fn () => googleIdToken(googleSigningKey()[0], ['iat' => time() - 7200, 'exp' => time() - 3600]),
    ]);

    it('refetches at most once a minute for unknown key ids', function () {
        [$forger] = googleSigningKey('made-up');
        Cache::put('google-id-token-jwks', ['keys' => [$this->jwk]], now()->addHour());
        publishKeys($this->jwk);

        foreach (range(1, 3) as $_) {
            try {
                app(GoogleIdTokenVerifier::class)->verify(googleIdToken($forger, kid: 'made-up'));
            } catch (InvalidGoogleIdToken) {
            }
        }

        Http::assertSentCount(1);
    });

    it('still refetches for a real new key right after a made-up one', function () {
        [$forger] = googleSigningKey('made-up');
        [$newPrivate, $newJwk] = googleSigningKey('kid-2');
        Cache::put('google-id-token-jwks', ['keys' => [$this->jwk]], now()->addHour());
        // Google rotates after the forged refetch has already cached the old set.
        Http::fake([GoogleIdTokenVerifier::JWKS_URL => Http::sequence()
            ->push(['keys' => [$this->jwk]])
            ->push(['keys' => [$this->jwk, $newJwk]])]);

        try {
            app(GoogleIdTokenVerifier::class)->verify(googleIdToken($forger, kid: 'made-up'));
        } catch (InvalidGoogleIdToken) {
        }

        $claims = app(GoogleIdTokenVerifier::class)->verify(googleIdToken($newPrivate, kid: 'kid-2'));

        expect($claims['sub'])->toBe('g-native-1');
    });

    it('keeps the cached key set when the refetch fails, and lets that key id try again', function () {
        [$newPrivate, $newJwk] = googleSigningKey('kid-2');
        Cache::put('google-id-token-jwks', ['keys' => [$this->jwk]], now()->addHour());
        // Google is down for the first refetch, back for the second.
        Http::fake([GoogleIdTokenVerifier::JWKS_URL => Http::sequence()
            ->push(null, 503)
            ->push(['keys' => [$this->jwk, $newJwk]])]);

        try {
            app(GoogleIdTokenVerifier::class)->verify(googleIdToken($newPrivate, kid: 'kid-2'));
        } catch (InvalidGoogleIdToken) {
        }

        // The old set is still there, so a token under the old key needs no network.
        expect(Cache::get('google-id-token-jwks'))->toBe(['keys' => [$this->jwk]]);
        expect(app(GoogleIdTokenVerifier::class)->verify(googleIdToken($this->private))['sub'])->toBe('g-native-1');
        Http::assertSentCount(1);

        // The failed attempt did not spend kid-2's once-a-minute refetch.
        $claims = app(GoogleIdTokenVerifier::class)->verify(googleIdToken($newPrivate, kid: 'kid-2'));

        expect($claims['sub'])->toBe('g-native-1');
        Http::assertSentCount(2);
    });

    it('caps refetches across many made-up key ids', function () {
        Cache::put('google-id-token-jwks', ['keys' => [$this->jwk]], now()->addHour());
        publishKeys($this->jwk);

        foreach (range(1, 15) as $i) {
            [$forger] = googleSigningKey("made-up-{$i}");

            try {
                app(GoogleIdTokenVerifier::class)->verify(googleIdToken($forger, kid: "made-up-{$i}"));
            } catch (InvalidGoogleIdToken) {
            }
        }

        Http::assertSentCount(10);
    });

    it('lets a real new key refetch as soon as the shared budget frees', function () {
        [$newPrivate, $newJwk] = googleSigningKey('kid-2');
        Cache::put('google-id-token-jwks', ['keys' => [$this->jwk]], now()->addHour());
        // One fake for the whole test (a second Http::fake would reset the
        // request count); Google rotates when the flag flips.
        $rotated = false;
        Http::fake([GoogleIdTokenVerifier::JWKS_URL => function () use (&$rotated, $newJwk) {
            return Http::response(['keys' => $rotated ? [$this->jwk, $newJwk] : [$this->jwk]]);
        }]);

        // A flood of made-up key IDs spends the minute's budget...
        foreach (range(1, 10) as $i) {
            [$forger] = googleSigningKey("made-up-{$i}");

            try {
                app(GoogleIdTokenVerifier::class)->verify(googleIdToken($forger, kid: "made-up-{$i}"));
            } catch (InvalidGoogleIdToken) {
            }
        }

        // ...so a real rotation arriving mid-minute cannot refetch yet.
        $this->travel(30)->seconds();
        $rotated = true;
        expect(fn () => app(GoogleIdTokenVerifier::class)->verify(googleIdToken($newPrivate, kid: 'kid-2')))
            ->toThrow(InvalidGoogleIdToken::class);
        Http::assertSentCount(10);

        // Once the budget frees, the new key gets its refetch at once: the
        // refused attempt did not hold kid-2's own once-a-minute marker.
        $this->travel(31)->seconds();
        $claims = app(GoogleIdTokenVerifier::class)->verify(googleIdToken($newPrivate, kid: 'kid-2'));

        expect($claims['sub'])->toBe('g-native-1');
        Http::assertSentCount(11);
    });
});

describe('POST /auth/google/native', function () {
    function fakeVerifier(array $claims = []): void
    {
        $verifier = Mockery::mock(GoogleIdTokenVerifier::class);
        $verifier->shouldReceive('verify')->andReturn(array_merge([
            'sub' => 'g-native-1',
            'email' => 'native@test.test',
            'name' => 'Native User',
            'picture' => 'https://example.com/p.png',
        ], $claims));
        app()->instance(GoogleIdTokenVerifier::class, $verifier);
    }

    it('creates a verified account and returns a named token', function () {
        fakeVerifier();

        $this->postJson('/api/auth/google/native', ['id_token' => 'x', 'device_name' => 'GoCast app (android)'])
            ->assertOk()
            ->assertJsonStructure(['data' => ['id', 'email', 'plan'], 'token'])
            ->assertJsonPath('data.email', 'native@test.test');

        $user = User::where('email', 'native@test.test')->firstOrFail();
        expect($user->google_id)->toBe('g-native-1')
            ->and($user->hasVerifiedEmail())->toBeTrue()
            ->and($user->tokens()->where('name', 'GoCast app (android)')->exists())->toBeTrue();
    });

    it('links an existing password account with the same email', function () {
        fakeVerifier();
        $existing = User::factory()->create(['email' => 'native@test.test', 'google_id' => null]);

        $this->postJson('/api/auth/google/native', ['id_token' => 'x', 'device_name' => 'app'])->assertOk();

        expect($existing->fresh()->google_id)->toBe('g-native-1')
            ->and(User::where('email', 'native@test.test')->count())->toBe(1);
    });

    it('refuses a token the verifier rejects, without creating anyone', function () {
        $verifier = Mockery::mock(GoogleIdTokenVerifier::class);
        $verifier->shouldReceive('verify')->andThrow(new InvalidGoogleIdToken('bad aud'));
        app()->instance(GoogleIdTokenVerifier::class, $verifier);

        $this->postJson('/api/auth/google/native', ['id_token' => 'x', 'device_name' => 'app'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('id_token');

        expect(User::where('email', 'native@test.test')->exists())->toBeFalse();
    });

    it('applies an invite sent along with the token', function () {
        fakeVerifier();
        $invite = Invite::factory()->create(['duration_days' => 30]);

        $this->postJson('/api/auth/google/native', ['id_token' => 'x', 'device_name' => 'app', 'invite' => $invite->code])
            ->assertOk()
            ->assertJsonPath('invite.applied', true)
            ->assertJsonPath('invite.plan', 'Pro');

        expect($invite->fresh()->uses)->toBe(1);
    });
});
