<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Services\BroadcastTokenService;
use App\Services\StationLifecycleService;

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

    $lifecycle = mock(StationLifecycleService::class);
    $lifecycle->shouldReceive('ensureRunning')
        ->once()
        ->withArgs(fn (Station $s) => $s->slug === 'jazz');
    app()->instance(StationLifecycleService::class, $lifecycle);

    $token = app(BroadcastTokenService::class)->issue($user, $station);

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token='.$token,
    ])->assertOk();
});

it('starts a stopped station when its owner goes live', function () {
    // Going live is a stronger statement of intent than the power button:
    // a station nobody started must not refuse the broadcast.
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create([
        'slug' => 'jazz',
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $token = app(BroadcastTokenService::class)->issue($user, $station);

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token='.$token,
    ])->assertOk();

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING)
        ->and($station->started_at)->not->toBeNull();
});

it('refuses a publish that would exceed the plan concurrency limit', function () {
    // Otherwise the cap is bypassable by hitting Go Live instead of Start.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['max_running_stations' => 1]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    Station::factory()->for($user, 'user')->create([
        'slug' => 'already-on-air',
        'desired_state' => Station::STATE_RUNNING,
    ]);
    $station = Station::factory()->for($user, 'user')->create([
        'slug' => 'jazz',
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $token = app(BroadcastTokenService::class)->issue($user, $station);

    postJson('/api/internal/whip-auth', [
        'action' => 'publish',
        'path' => 'jazz/live',
        'query' => 'token='.$token,
    ])->assertForbidden();

    expect($station->refresh()->desired_state)->toBe(Station::STATE_STOPPED);
});

it('still allows publish when the supervisor cannot reach the docker daemon', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    $lifecycle = mock(StationLifecycleService::class);
    $lifecycle->shouldReceive('ensureRunning')->once()->andThrow(new RuntimeException('daemon down'));
    app()->instance(StationLifecycleService::class, $lifecycle);

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
