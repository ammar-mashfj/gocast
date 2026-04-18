<?php

use App\Models\Station;
use App\Models\StreamSession;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Redis;

beforeEach(function () {
    config([
        'services.relay_health_url' => 'http://relay.test/health',
        'services.relay_stations_url' => 'http://relay.test/stations',
    ]);
    Redis::shouldReceive('del')->andReturn(1)->byDefault();
});

it('does nothing when no stations are live', function () {
    Http::fake([
        'relay.test/stations' => Http::response(['stations' => []], 200),
    ]);

    $this->artisan('app:clean-stale-streams')
        ->expectsOutputToContain('No live stations to check.')
        ->assertExitCode(0);
});

it('leaves stations alone when the relay still has them', function () {
    $station = Station::factory()->create(['is_live' => true]);
    StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinutes(10),
    ]);

    Http::fake([
        'relay.test/stations' => Http::response(['stations' => [$station->id]], 200),
    ]);

    $this->artisan('app:clean-stale-streams')
        ->expectsOutputToContain('All live stations are active on the relay.')
        ->assertExitCode(0);

    expect($station->fresh()->is_live)->toBeTrue();
    expect(StreamSession::where('station_id', $station->id)->whereNull('ended_at')->exists())->toBeTrue();
});

it('clears live stations the relay does not know about', function () {
    $orphan = Station::factory()->create(['is_live' => true]);
    $active = Station::factory()->create(['is_live' => true]);
    StreamSession::create(['station_id' => $orphan->id, 'started_at' => now()->subMinutes(10)]);
    StreamSession::create(['station_id' => $active->id, 'started_at' => now()->subMinutes(10)]);

    Http::fake([
        'relay.test/stations' => Http::response(['stations' => [$active->id]], 200),
    ]);

    $this->artisan('app:clean-stale-streams')
        ->expectsOutputToContain('Cleaned 1 stale station(s) (not present on relay).')
        ->assertExitCode(0);

    expect($orphan->fresh()->is_live)->toBeFalse();
    expect($active->fresh()->is_live)->toBeTrue();
    expect(StreamSession::where('station_id', $orphan->id)->whereNull('ended_at')->exists())->toBeFalse();
    expect(StreamSession::where('station_id', $active->id)->whereNull('ended_at')->exists())->toBeTrue();
});

it('clears every live station when the relay is unreachable', function () {
    $a = Station::factory()->create(['is_live' => true]);
    $b = Station::factory()->create(['is_live' => true]);
    StreamSession::create(['station_id' => $a->id, 'started_at' => now()->subMinutes(10)]);
    StreamSession::create(['station_id' => $b->id, 'started_at' => now()->subMinutes(10)]);

    Http::fake([
        'relay.test/stations' => Http::response(null, 500),
    ]);

    $this->artisan('app:clean-stale-streams')
        ->expectsOutputToContain('Cleaned 2 stale station(s) (relay unreachable).')
        ->assertExitCode(0);

    expect($a->fresh()->is_live)->toBeFalse();
    expect($b->fresh()->is_live)->toBeFalse();
});
