<?php

use App\Models\Station;
use App\Models\User;
use App\Services\BroadcastTokenService;
use App\Services\LiquidsoapSupervisor;

use function Pest\Laravel\postJson;

beforeEach(function () {
    // BroadcastTokenService signs with APP_KEY. Pin one so tokens are stable.
    config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);
});

it('allows read actions without any token', function () {
    postJson('/api/internal/whip-auth', [
        'action' => 'read',
        'path' => 'jazz/live',
    ])->assertOk();

    postJson('/api/internal/whip-auth', [
        'action' => 'playback',
        'path' => 'jazz/live',
    ])->assertOk();
});

it('rejects publish attempts with no token', function () {
    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => '',
    ])->assertForbidden();
});

it('rejects publish attempts with a garbage token', function () {
    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token=not-a-real-token',
    ])->assertForbidden();
});

it('allows publish with a valid station-scoped token', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    $token = app(BroadcastTokenService::class)->issue($user, $station);

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token='.$token,
    ])->assertOk();
});

it('rejects publish with a token scoped to a different station', function () {
    $user = User::factory()->create();
    $jazz = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);
    Station::factory()->for($user, 'user')->create(['slug' => 'rock']);

    $token = app(BroadcastTokenService::class)->issue($user, $jazz);

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'rock/live',
        'query' => 'token='.$token,
    ])->assertForbidden();
});

it('rejects publish for paths with traversal sequences', function () {
    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => '../etc/passwd',
        'query' => 'token=anything',
    ])->assertForbidden();
});

it('rejects publish for paths that are not slug-shaped', function () {
    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'NOT_A_SLUG/live',
        'query' => 'token=anything',
    ])->assertForbidden();
});

it('rejects publish when the station behind a valid token is gone', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    // Tokens are stateless — this one still MAC-validates after the station
    // row disappears, so the controller has to check existence itself.
    $token = app(BroadcastTokenService::class)->issue($user, $station);
    $station->forceDelete();

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token='.$token,
    ])->assertForbidden();
});

it('ensures the station Liquidsoap container is running before allowing publish', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    $supervisor = mock(LiquidsoapSupervisor::class);
    $supervisor->shouldReceive('ensure')
        ->once()
        ->withArgs(fn (Station $s) => $s->slug === 'jazz');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $token = app(BroadcastTokenService::class)->issue($user, $station);

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token='.$token,
    ])->assertOk();
});

it('still allows publish when the supervisor cannot reach the docker daemon', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    $supervisor = mock(LiquidsoapSupervisor::class);
    $supervisor->shouldReceive('ensure')->once()->andThrow(new RuntimeException('daemon down'));
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $token = app(BroadcastTokenService::class)->issue($user, $station);

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token='.$token,
    ])->assertOk();
});

it('rejects unknown actions outright', function () {
    postJson('/api/internal/whip-auth', [
        'action' => 'api',
        'path' => 'jazz/live',
    ])->assertForbidden();
});
