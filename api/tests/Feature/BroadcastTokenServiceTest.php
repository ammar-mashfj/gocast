<?php

use App\Models\Station;
use App\Models\User;
use App\Services\BroadcastTokenService;
use Illuminate\Support\Carbon;

beforeEach(function () {
    config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);
});

it('issues a token a fresh instance can verify against the station slug', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);
    $tokens = new BroadcastTokenService;

    $token = $tokens->issue($user, $station);

    expect($tokens->verify($token, 'jazz'))->toMatchArray([
        'user_id' => $user->id,
        'station_slug' => 'jazz',
    ]);
});

it('rejects a token presented against the wrong station', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);
    $tokens = new BroadcastTokenService;

    $token = $tokens->issue($user, $station);

    expect($tokens->verify($token, 'rock'))->toBeNull();
});

it('rejects a token after expiry', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);
    $tokens = new BroadcastTokenService;

    $token = $tokens->issue($user, $station, ttlSeconds: 5);

    Carbon::setTestNow(Carbon::now()->addSeconds(10));

    expect($tokens->verify($token, 'jazz'))->toBeNull();

    Carbon::setTestNow();
});

it('rejects a token with a tampered signature', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);
    $tokens = new BroadcastTokenService;

    $token = $tokens->issue($user, $station);
    [$payload] = explode('.', $token);
    $forged = $payload.'.AAAA';

    expect($tokens->verify($forged, 'jazz'))->toBeNull();
});

it('rejects a malformed token', function () {
    $tokens = new BroadcastTokenService;

    expect($tokens->verify('not-a-token', 'jazz'))->toBeNull();
});
