<?php

use App\Models\Station;
use App\Models\StationEvent;

/**
 * Retention for the station timeline. The table's growth is driven by failure
 * rather than by traffic — a flapping container writes more in a night than a
 * healthy station writes in a month — so the prune is what stops one broken
 * station from becoming the largest table in the database.
 */
beforeEach(function () {
    $this->station = Station::factory()->create();
});

it('deletes events past the retention window and keeps the rest', function () {
    config(['station_events.retention_days' => 30]);

    $old = StationEvent::factory()->for($this->station)->old(45)->create();
    $recent = StationEvent::factory()->for($this->station)->old(5)->create();

    $this->artisan('stations:prune-events')
        ->expectsOutputToContain('Pruned 1 station events')
        ->assertSuccessful();

    expect(StationEvent::find($old->id))->toBeNull()
        ->and(StationEvent::find($recent->id))->not->toBeNull();
});

it('keeps everything when retention is switched off', function () {
    config(['station_events.retention_days' => 0]);

    StationEvent::factory()->for($this->station)->old(400)->create();

    $this->artisan('stations:prune-events')
        ->expectsOutputToContain('retention is disabled')
        ->assertSuccessful();

    expect(StationEvent::count())->toBe(1);
});

it('clears a backlog larger than one chunk', function () {
    // The loop is the whole point: the first run after this ships faces a
    // backlog, and a single unbounded DELETE across it would hold locks long
    // enough to be felt on the live site.
    config(['station_events.retention_days' => 30]);

    StationEvent::factory()->for($this->station)->old(45)->count(25)->create();

    $this->artisan('stations:prune-events', ['--chunk' => 100])
        ->expectsOutputToContain('Pruned 25 station events')
        ->assertSuccessful();

    expect(StationEvent::count())->toBe(0);
});
