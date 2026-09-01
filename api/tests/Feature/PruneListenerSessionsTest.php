<?php

use App\Models\ListenerSession;
use App\Models\ListenerStatHourly;
use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\artisan;

beforeEach(function () {
    $this->station = Station::factory()->for(User::factory(), 'user')->create();
});

it('deletes sessions past the retention window and keeps the rest', function () {
    config(['analytics.retention_days' => 90]);

    $old = ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => now()->subDays(120),
    ]);
    $recent = ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => now()->subDays(30),
    ]);

    artisan('listeners:prune')->assertSuccessful();

    expect(ListenerSession::find($old->id))->toBeNull()
        ->and(ListenerSession::find($recent->id))->not->toBeNull();
});

it('leaves the rollups standing when the raw rows go', function () {
    config(['analytics.retention_days' => 90]);

    ListenerStatHourly::create([
        'station_id' => $this->station->id,
        'hour' => now()->subDays(120)->startOfHour(),
        'peak_listeners' => 31,
        'listener_minutes' => 740,
        'sampled_minutes' => 60,
        'sessions_started' => 88,
    ]);

    ListenerSession::factory()->count(3)->for($this->station)->closed(600)->create([
        'started_at' => now()->subDays(120),
    ]);

    artisan('listeners:prune')->assertSuccessful();

    // The whole reason the rollups exist: everything with a longer shelf life
    // was summarised before the raw rows aged out.
    expect(ListenerSession::count())->toBe(0)
        ->and(ListenerStatHourly::where('station_id', $this->station->id)->value('peak_listeners'))->toBe(31);
});

it('does nothing when retention is disabled', function () {
    config(['analytics.retention_days' => 0]);

    ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => now()->subYears(2),
    ]);

    artisan('listeners:prune')
        ->expectsOutputToContain('retention is disabled')
        ->assertSuccessful();

    expect(ListenerSession::count())->toBe(1);
});

it('deletes a station\'s listener history when the station is hard-deleted', function () {
    ListenerSession::factory()->count(2)->for($this->station)->create();
    ListenerStatHourly::create([
        'station_id' => $this->station->id,
        'hour' => now()->startOfHour(),
        'peak_listeners' => 5,
    ]);

    // Soft delete keeps everything — the owner may restore the station.
    $this->station->delete();
    expect(ListenerSession::count())->toBe(2);

    $this->station->forceDelete();

    expect(ListenerSession::count())->toBe(0)
        ->and(ListenerStatHourly::count())->toBe(0);
});
