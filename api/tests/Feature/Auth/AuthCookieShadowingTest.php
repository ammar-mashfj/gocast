<?php

use App\Models\User;

use function Pest\Laravel\withHeader;

/**
 * Sessions created before `SESSION_DOMAIN` was set got a host-only `token`
 * cookie on the API host. It is a distinct cookie from the domain-scoped one
 * the app writes now, so browsers send both — and PHP keeps the first, which
 * is the stale one. See UseAuthTokenCookie.
 */
it('authenticates with the current token when a stale duplicate cookie shadows it', function () {
    $user = User::factory()->create();
    $token = $user->createToken('auth')->plainTextToken;

    withHeader('Cookie', 'token=1%7Crevoked-legacy-token; token='.urlencode($token))
        ->getJson('/api/user')
        ->assertSuccessful()
        ->assertJsonPath('data.id', $user->id);
});

it('expires the legacy host-only cookie once a duplicate is seen', function () {
    $user = User::factory()->create();
    $token = $user->createToken('auth')->plainTextToken;

    $response = withHeader('Cookie', 'token=1%7Crevoked-legacy-token; token='.urlencode($token))
        ->getJson('/api/user')
        ->assertSuccessful();

    $cleared = collect($response->headers->getCookies())
        ->first(fn ($cookie) => $cookie->getName() === 'token');

    expect($cleared)->not->toBeNull();
    // A null domain is what makes this delete the host-only cookie rather
    // than the domain-scoped one holding the live session.
    expect($cleared->getDomain())->toBeNull();
    expect($cleared->getValue())->toBe('');
    expect($cleared->getExpiresTime())->toBeLessThan(time());
});

it('leaves the cookie alone when only one token is sent', function () {
    $user = User::factory()->create();
    $token = $user->createToken('auth')->plainTextToken;

    $response = withHeader('Cookie', 'token='.urlencode($token))
        ->getJson('/api/user')
        ->assertSuccessful();

    expect($response->headers->getCookies())->toBeEmpty();
});

it('still prefers an explicit bearer token over the cookies', function () {
    $user = User::factory()->create();
    $token = $user->createToken('auth')->plainTextToken;

    withHeader('Cookie', 'token=1%7Crevoked-legacy-token; token=2%7Calso-revoked')
        ->withHeader('Authorization', 'Bearer '.$token)
        ->getJson('/api/user')
        ->assertSuccessful()
        ->assertJsonPath('data.id', $user->id);
});
