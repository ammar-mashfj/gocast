<?php

use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use App\Services\BroadcastStateService;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);
    Cache::flush();
    Bus::fake();
});

it('blocks a different device while a station has active relay state', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'relay-live']);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinute(),
    ]);

    app(BroadcastStateService::class)->markLive($station, $session, 'laptop', 'connection-1');

    actingAs($owner, 'sanctum')
        ->postJson("/api/stations/{$station->slug}/sessions", [
            'device_id' => 'phone',
            'source_type' => 'browser',
        ])
        ->assertStatus(409)
        ->assertJson([
            'code' => 'station_already_live',
            'message' => 'This station is already live from another device.',
        ]);
});

it('allows the same device to reuse its active stream session', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'same-device']);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinute(),
    ]);

    app(BroadcastStateService::class)->markLive($station, $session, 'laptop', 'connection-1');

    actingAs($owner, 'sanctum')
        ->postJson("/api/stations/{$station->slug}/sessions", [
            'device_id' => 'laptop',
            'source_type' => 'browser',
        ])
        ->assertOk()
        ->assertJsonPath('data.id', $session->id)
        ->assertJson(['message' => 'Stream session already active.']);
});

it('closes a stale open database session when relay state is gone', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'stale-db']);
    $stale = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinutes(10),
    ]);

    actingAs($owner, 'sanctum')
        ->postJson("/api/stations/{$station->slug}/sessions", [
            'device_id' => 'laptop',
            'source_type' => 'browser',
        ])
        ->assertCreated()
        ->assertJson(['message' => 'Stream started.']);

    expect($stale->fresh()->ended_at)->not->toBeNull();
    expect(StreamSession::where('station_id', $station->id)->whereNull('ended_at')->count())->toBe(1);
});

it('treats starting relay state as live in station responses', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'starting-visible']);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now(),
    ]);

    app(BroadcastStateService::class)->markStarting($station, $session, 'laptop');

    actingAs($owner, 'sanctum')
        ->getJson("/api/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonPath('data.is_live', true);
});

it('starts a broadcast from the forwarded auth cookie and returns relay context', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'cookie-start']);
    $token = $owner->createToken('auth')->plainTextToken;

    postJson('/api/internal/validate-stream', [
        'station_id' => $station->slug,
        'device_id' => 'laptop',
        'source_type' => 'browser',
    ], [
        'X-Internal-Key' => 'test-internal-key',
        'Authorization' => "Bearer {$token}",
    ])
        ->assertOk()
        ->assertJsonPath('station.slug', 'cookie-start')
        ->assertJsonPath('station.device_id', 'laptop');

    expect(StreamSession::where('station_id', $station->id)->whereNull('ended_at')->count())->toBe(1);
});

it('blocks relay start from a different device while active', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'cookie-block']);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinute(),
    ]);
    $token = $owner->createToken('auth')->plainTextToken;

    app(BroadcastStateService::class)->markLive($station, $session, 'laptop', 'connection-1');

    postJson('/api/internal/validate-stream', [
        'station_id' => $station->slug,
        'device_id' => 'phone',
        'source_type' => 'browser',
    ], [
        'X-Internal-Key' => 'test-internal-key',
        'Authorization' => "Bearer {$token}",
    ])
        ->assertStatus(409)
        ->assertJson([
            'valid' => false,
            'code' => 'station_already_live',
        ]);
});

it('returns a structured conflict when relay heartbeats a missing session', function () {
    $station = Station::factory()->create(['slug' => 'missing-heartbeat']);

    postJson('/api/internal/broadcast-state', [
        'station_id' => $station->id,
        'session_id' => '019dbab3-c33d-7344-8343-bc02cbd3bac8',
        'device_id' => 'laptop',
        'connection_id' => 'connection-1',
        'status' => 'live',
    ], [
        'X-Internal-Key' => 'test-internal-key',
    ])
        ->assertStatus(409)
        ->assertJson([
            'code' => 'broadcast_session_missing',
            'message' => 'Broadcast session is no longer active.',
        ]);
});
