<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Redis;

beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-reaper-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);
    config(['liquidsoap.idle_stop_hours' => 2]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

/**
 * Listener counts live in Redis, written by stations:sync-listeners.
 */
function setListeners(Station $station, int $count): void
{
    Redis::setex("listeners:{$station->id}", 300, $count);
}

function reapableStation(?int $idleStopHours = null): Station
{
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['idle_stop_hours' => $idleStopHours]);

    return Station::factory()
        ->for(User::factory()->create(['plan_id' => $plan->id]), 'user')
        ->create(['desired_state' => Station::STATE_RUNNING]);
}

it('marks a station idle on the first pass instead of stopping it immediately', function () {
    // The window measures *continuous* idleness, so the first observation
    // only lays the marker.
    $station = reapableStation(2);
    setListeners($station, 0);

    $this->artisan('stations:reap-idle')->assertExitCode(0);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('stops a station that has been idle for longer than its plan allows', function () {
    $station = reapableStation(2);
    setListeners($station, 0);

    Cache::put(
        'station-idle-since:'.$station->id,
        now()->subHours(3)->toIso8601String(),
        3600,
    );

    $this->artisan('stations:reap-idle')
        ->expectsOutputToContain('stopped '.$station->slug)
        ->assertExitCode(0);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_STOPPED);
});

it('clears the idle marker as soon as somebody tunes in', function () {
    $station = reapableStation(2);
    setListeners($station, 4);

    Cache::put(
        'station-idle-since:'.$station->id,
        now()->subHours(5)->toIso8601String(),
        3600,
    );

    $this->artisan('stations:reap-idle')->assertExitCode(0);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING)
        ->and(Cache::get('station-idle-since:'.$station->id))->toBeNull();
});

it('never reaps a station with a broadcaster on air', function () {
    $station = reapableStation(2);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);
    setListeners($station, 0);

    Cache::put(
        'station-idle-since:'.$station->id,
        now()->subHours(9)->toIso8601String(),
        3600,
    );

    $this->artisan('stations:reap-idle')->assertExitCode(0);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('leaves plans with reaping disabled alone', function () {
    // Paid tiers set idle_stop_hours = 0 — their stations stay up.
    $station = reapableStation(0);
    setListeners($station, 0);

    Cache::put(
        'station-idle-since:'.$station->id,
        now()->subDays(2)->toIso8601String(),
        3600,
    );

    $this->artisan('stations:reap-idle')->assertExitCode(0);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('falls back to the configured window when the plan does not set one', function () {
    $station = reapableStation(null);
    setListeners($station, 0);

    Cache::put(
        'station-idle-since:'.$station->id,
        now()->subHours(3)->toIso8601String(),
        3600,
    );

    $this->artisan('stations:reap-idle')->assertExitCode(0);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_STOPPED);
});

it('ignores stations that are already off air', function () {
    Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $this->artisan('stations:reap-idle')
        ->expectsOutputToContain('No stations are on air')
        ->assertExitCode(0);
});

it('reports what it would stop in dry-run mode', function () {
    $station = reapableStation(2);
    setListeners($station, 0);

    Cache::put(
        'station-idle-since:'.$station->id,
        now()->subHours(4)->toIso8601String(),
        3600,
    );

    $this->artisan('stations:reap-idle', ['--dry-run' => true])
        ->expectsOutputToContain('would stop '.$station->slug)
        ->assertExitCode(0);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING);
});
