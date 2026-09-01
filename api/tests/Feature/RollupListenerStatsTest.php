<?php

use App\Models\ListenerGeoDaily;
use App\Models\ListenerSession;
use App\Models\ListenerStatHourly;
use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\artisan;

beforeEach(function () {
    $this->freezeSecond();
    $this->station = Station::factory()->for(User::factory(), 'user')->create();
});

it('counts arrivals, distinct listeners and qualifying listens for the hour', function () {
    $startedAt = now()->subHours(2)->startOfHour()->addMinutes(10);

    // Two sessions from the same visitor, one from another.
    $repeat = hash('sha256', 'repeat-visitor');

    ListenerSession::factory()->for($this->station)->closed(300)->create([
        'started_at' => $startedAt, 'visitor_hash' => $repeat,
    ]);
    ListenerSession::factory()->for($this->station)->closed(900)->create([
        'started_at' => $startedAt->copy()->addMinutes(5), 'visitor_hash' => $repeat,
    ]);
    ListenerSession::factory()->for($this->station)->closed(1200)->create([
        'started_at' => $startedAt, 'visitor_hash' => hash('sha256', 'someone-else'),
    ]);

    // Pressed play, left after eight seconds. Stored, but not an audience.
    ListenerSession::factory()->for($this->station)->bounced()->create([
        'started_at' => $startedAt, 'seconds' => 8,
    ]);

    artisan('listeners:rollup')->assertSuccessful();

    $hour = ListenerStatHourly::where('station_id', $this->station->id)->first();

    expect($hour->sessions_started)->toBe(4)
        ->and($hour->unique_listeners)->toBe(3)
        ->and($hour->qualified_listens)->toBe(3);
});

it('never overwrites the sample columns the sweep accumulated', function () {
    $hour = now()->subHour()->startOfHour();

    ListenerStatHourly::create([
        'station_id' => $this->station->id,
        'hour' => $hour,
        'peak_listeners' => 42,
        'listener_minutes' => 900,
        'sampled_minutes' => 60,
    ]);

    ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => $hour->copy()->addMinutes(3),
    ]);

    artisan('listeners:rollup')->assertSuccessful();

    $row = ListenerStatHourly::where('station_id', $this->station->id)->first();

    // These cannot be recomputed — the per-minute samples they came from are
    // not stored anywhere — so the rollup must leave them untouched.
    expect($row->peak_listeners)->toBe(42)
        ->and($row->listener_minutes)->toBe(900)
        ->and($row->sampled_minutes)->toBe(60)
        ->and($row->sessions_started)->toBe(1);
});

it('does not count a still-open session as a bounce', function () {
    $startedAt = now()->subMinutes(20);

    // Someone who pressed play twenty minutes ago and is still listening. Their
    // `seconds` is 0 until the sweep closes them; counting that as a listener
    // who left early is exactly the mistake an accumulating rollup makes.
    ListenerSession::factory()->for($this->station)->create(['started_at' => $startedAt]);

    artisan('listeners:rollup')->assertSuccessful();

    $hour = ListenerStatHourly::where('station_id', $this->station->id)->first();

    expect($hour->sessions_started)->toBe(1)
        ->and($hour->qualified_listens)->toBe(0);
});

it('picks up a late-closing session on a later run', function () {
    $startedAt = now()->subMinutes(30);

    $session = ListenerSession::factory()->for($this->station)->create(['started_at' => $startedAt]);

    artisan('listeners:rollup')->assertSuccessful();
    expect(ListenerStatHourly::where('station_id', $this->station->id)->value('qualified_listens'))->toBe(0);

    $session->update(['ended_at' => now(), 'seconds' => 1800]);

    // Recomputing rather than accumulating is what makes this possible.
    artisan('listeners:rollup')->assertSuccessful();
    expect(ListenerStatHourly::where('station_id', $this->station->id)->value('qualified_listens'))->toBe(1);
});

it('is safe to run twice', function () {
    ListenerSession::factory()->count(3)->for($this->station)->closed(600)->create([
        'started_at' => now()->subHour()->startOfHour()->addMinute(),
    ]);

    artisan('listeners:rollup')->assertSuccessful();
    artisan('listeners:rollup')->assertSuccessful();

    expect(ListenerStatHourly::where('station_id', $this->station->id)->value('sessions_started'))->toBe(3);
});

it('aggregates closed sessions by country and day', function () {
    $startedAt = now()->subDay()->startOfDay()->addHours(9);

    ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => $startedAt, 'country' => 'DE',
    ]);
    ListenerSession::factory()->for($this->station)->closed(300)->create([
        'started_at' => $startedAt->copy()->addHour(), 'country' => 'DE',
    ]);
    ListenerSession::factory()->for($this->station)->closed(1200)->create([
        'started_at' => $startedAt, 'country' => 'BR',
    ]);

    artisan('listeners:rollup')->assertSuccessful();

    $germany = ListenerGeoDaily::where('station_id', $this->station->id)->where('country', 'DE')->first();

    expect($germany->sessions)->toBe(2)
        ->and($germany->listener_seconds)->toBe(900)
        ->and(ListenerGeoDaily::where('station_id', $this->station->id)->count())->toBe(2);
});

it('refuses a country window that reaches past session retention', function () {
    config(['analytics.retention_days' => 90]);

    // Recomputing a day whose sessions were already pruned would overwrite a
    // real historical row with zero.
    artisan('listeners:rollup', ['--days' => 120])
        ->expectsOutputToContain('refusing to overwrite rolled-up history')
        ->assertSuccessful();
});
