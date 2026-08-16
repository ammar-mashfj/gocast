<?php

use App\Models\Station;
use App\Models\User;
use App\Services\TurnCredentialService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

use function Pest\Laravel\actingAs;

/**
 * TURN relays media for broadcasters whose network cannot carry peer-to-peer
 * UDP. The service must never take the broadcast down with it: an outage or a
 * missing config degrades to STUN, which is how the app behaved before TURN.
 */
beforeEach(function () {
    Cache::forget('cloudflare-turn-ice-servers');
    config([
        'app.key' => 'base64:'.base64_encode(str_repeat('k', 32)),
        'services.cloudflare_turn.key_id' => 'test-key',
        'services.cloudflare_turn.api_token' => 'test-token',
        'services.cloudflare_turn.ttl' => 3600,
    ]);
});

function cloudflareReturns(array $iceServers): void
{
    Http::fake([
        'rtc.live.cloudflare.com/*' => Http::response(['iceServers' => $iceServers], 201),
    ]);
}

it('returns stun only when turn is not configured', function () {
    config(['services.cloudflare_turn.key_id' => null, 'services.cloudflare_turn.api_token' => null]);
    Http::preventStrayRequests();

    $servers = app(TurnCredentialService::class)->iceServers();

    expect($servers)->toHaveCount(2)
        ->and(collect($servers)->pluck('urls')->all())
        ->each->toStartWith('stun:');
});

it('returns cloudflare turn servers with stun appended as a fallback', function () {
    cloudflareReturns([
        'urls' => ['turns:turn.cloudflare.com:443?transport=tcp'],
        'username' => 'ephemeral-user',
        'credential' => 'ephemeral-secret',
    ]);

    $servers = app(TurnCredentialService::class)->iceServers();

    expect($servers[0]['username'])->toBe('ephemeral-user')
        ->and($servers[0]['credential'])->toBe('ephemeral-secret')
        // TLS on 443 is the entry that gets through a VPN's leak protection
        // and UDP-blocking firewalls — the whole reason TURN is here.
        ->and($servers[0]['urls'])->toContain('turns:turn.cloudflare.com:443?transport=tcp')
        // STUN still present so gathering works if the relay is unreachable.
        ->and(collect($servers)->last()['urls'])->toStartWith('stun:');
});

it('falls back to stun when cloudflare errors, and does not cache the failure', function () {
    Http::fake(['rtc.live.cloudflare.com/*' => Http::response('nope', 500)]);

    $servers = app(TurnCredentialService::class)->iceServers();

    expect(collect($servers)->pluck('urls')->all())->each->toStartWith('stun:');
    // A cached failure would strand every broadcaster on STUN for the whole
    // cache window, long after Cloudflare recovered.
    expect(Cache::get('cloudflare-turn-ice-servers'))->toBeNull();
});

it('falls back to stun when cloudflare is unreachable', function () {
    Http::fake(fn () => throw new ConnectionException('timeout'));

    $servers = app(TurnCredentialService::class)->iceServers();

    expect(collect($servers)->pluck('urls')->all())->each->toStartWith('stun:');
});

it('reuses one credential fetch across broadcasters', function () {
    cloudflareReturns(['urls' => ['turns:turn.cloudflare.com:443?transport=tcp']]);

    app(TurnCredentialService::class)->iceServers();
    app(TurnCredentialService::class)->iceServers();

    Http::assertSentCount(1);
});

it('hands the broadcaster ice servers alongside the token', function () {
    cloudflareReturns([
        'urls' => ['turns:turn.cloudflare.com:443?transport=tcp'],
        'username' => 'ephemeral-user',
        'credential' => 'ephemeral-secret',
    ]);

    $owner = User::factory()->create();
    Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);

    $response = actingAs($owner, 'sanctum')
        ->postJson('/api/auth/broadcast-token', ['station_slug' => 'jazz'])
        ->assertOk()
        ->assertJsonStructure(['token', 'expires_in', 'ice_servers']);

    expect($response->json('ice_servers.0.credential'))->toBe('ephemeral-secret');
});

it('never leaks the turn key to the browser', function () {
    cloudflareReturns(['urls' => ['turns:turn.cloudflare.com:443?transport=tcp']]);

    $owner = User::factory()->create();
    Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);

    $body = actingAs($owner, 'sanctum')
        ->postJson('/api/auth/broadcast-token', ['station_slug' => 'jazz'])
        ->assertOk()
        ->getContent();

    expect($body)->not->toContain('test-key')
        ->and($body)->not->toContain('test-token');
});
