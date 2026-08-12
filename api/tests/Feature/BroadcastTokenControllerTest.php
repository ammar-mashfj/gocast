<?php

use App\Models\Station;
use App\Models\User;
use App\Services\BroadcastTokenService;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;

beforeEach(function () {
    config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);
});

it('rejects unauthenticated requests', function () {
    postJson('/api/auth/broadcast-token', ['station_slug' => 'jazz'])
        ->assertUnauthorized();
});

it('issues a token to the station owner', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);

    $response = actingAs($owner, 'sanctum')
        ->postJson('/api/auth/broadcast-token', ['station_slug' => 'jazz'])
        ->assertOk()
        ->assertJsonStructure(['token', 'expires_in']);

    expect($response->json('expires_in'))->toBe(BroadcastTokenService::TTL_SECONDS);

    // Sanity-check: the issued token should verify against the same station.
    $verified = app(BroadcastTokenService::class)->verify($response->json('token'), $station->slug);
    expect($verified)->not->toBeNull();
    expect((string) $verified['user_id'])->toBe((string) $owner->id);
});

it('forbids a user from issuing a token for someone else\'s station', function () {
    $owner = User::factory()->create();
    Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);
    $stranger = User::factory()->create();

    actingAs($stranger, 'sanctum')
        ->postJson('/api/auth/broadcast-token', ['station_slug' => 'jazz'])
        ->assertForbidden();
});

it('responds with 403 for an unknown station slug', function () {
    $user = User::factory()->create();

    // The controller folds "unknown station" and "not your station" into the
    // same 403 to avoid leaking which stations exist via enumeration.
    actingAs($user, 'sanctum')
        ->postJson('/api/auth/broadcast-token', ['station_slug' => 'no-such-station'])
        ->assertForbidden();
});

it('rejects requests missing the station_slug field', function () {
    $user = User::factory()->create();

    actingAs($user, 'sanctum')
        ->postJson('/api/auth/broadcast-token', [])
        ->assertUnprocessable();
});
