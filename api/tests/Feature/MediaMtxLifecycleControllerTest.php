<?php

use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\postJson;
use function Pest\Laravel\withHeaders;

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);
});

it('rejects whip-ready without the internal key', function () {
    postJson('/api/internal/whip-ready', ['path' => 'jazz/live'])
        ->assertUnauthorized();
});

it('returns 404 when the slug is unknown', function () {
    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/whip-ready', ['path' => 'no-such-station/live'])
        ->assertNotFound();
});

it('marks the station live and opens a stream session on whip-ready', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'jazz',
        'is_live' => false,
    ]);

    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/whip-ready', ['path' => 'jazz/live'])
        ->assertOk()
        ->assertJson(['ok' => true]);

    expect($station->fresh()->is_live)->toBeTrue();
    expect($station->streamSessions()->whereNull('ended_at')->count())->toBe(1);
});

it('is idempotent: two ready calls in a row reuse the same open session', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'jazz',
        'is_live' => false,
    ]);

    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/whip-ready', ['path' => 'jazz/live'])
        ->assertOk();
    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/whip-ready', ['path' => 'jazz/live'])
        ->assertOk();

    expect($station->streamSessions()->count())->toBe(1);
});

it('marks the station offline and closes any open session on whip-not-ready', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'jazz',
        'is_live' => true,
    ]);
    $session = $station->streamSessions()->create([
        'started_at' => now(),
        'source_type' => 'browser',
    ]);

    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/whip-not-ready', ['path' => 'jazz/live'])
        ->assertOk();

    expect($station->fresh()->is_live)->toBeFalse();
    expect($session->fresh()->ended_at)->not->toBeNull();
});

it('rejects whip-not-ready without the internal key', function () {
    postJson('/api/internal/whip-not-ready', ['path' => 'jazz/live'])
        ->assertUnauthorized();
});
