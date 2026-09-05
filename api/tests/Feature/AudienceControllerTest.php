<?php

use App\Models\ListenerGeoDaily;
use App\Models\ListenerSession;
use App\Models\ListenerStatHourly;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The plan gate here is a DISPLAY gate. Every test in this file that asserts a
 * free account cannot see something should also be readable as proof that the
 * data existed anyway — that is what makes an upgrade instant rather than the
 * start of a ninety-day wait.
 */
beforeEach(function () {
    $this->freezeSecond();

    // updateOrCreate, not create: the plans migration ships real `free` and
    // `pro` rows, and the slug is unique.
    $this->pro = Plan::updateOrCreate(
        ['slug' => 'pro'],
        ['name' => 'Pro', 'max_stations' => 5, 'max_listeners' => 1000, 'analytics_days' => 90],
    );
    $this->free = Plan::updateOrCreate(
        ['slug' => 'free'],
        ['name' => 'Free', 'max_stations' => 1, 'max_listeners' => 100, 'analytics_days' => 0],
    );

    $this->user = User::factory()->create(['plan_id' => $this->pro->id]);
    $this->station = Station::factory()->for($this->user, 'user')->create(['slug' => 'jazz']);
});

it('returns a dense day series covering the whole window', function () {
    ListenerStatHourly::create([
        'station_id' => $this->station->id,
        'hour' => now()->subDays(2)->startOfHour(),
        'peak_listeners' => 9,
        'listener_minutes' => 240,
        'sampled_minutes' => 60,
    ]);

    $response = actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=7')
        ->assertOk()
        ->assertJsonPath('data.locked', false)
        ->assertJsonPath('data.range_days', 7);

    // Sparse rollup rows, dense output: a quiet fortnight must not draw as a
    // narrower busy one.
    expect($response->json('data.daily'))->toHaveCount(7);

    $day = collect($response->json('data.daily'))
        ->firstWhere('day', now()->subDays(2)->toDateString());

    expect($day['listener_minutes'])->toBe(240)
        ->and($day['peak'])->toBe(9);
});

it('takes the highest concurrent figure across the window, never the sum', function () {
    foreach ([3, 5] as $i => $peak) {
        ListenerStatHourly::create([
            'station_id' => $this->station->id,
            'hour' => now()->subHours($i + 1)->startOfHour(),
            'peak_listeners' => $peak,
            'listener_minutes' => 60,
            'sampled_minutes' => 60,
        ]);
    }

    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=7')
        ->assertOk()
        // Two listeners in one hour and five in the next is a peak of five.
        ->assertJsonPath('data.totals.peak', 5);
});

it('counts distinct listeners per day rather than per hour', function () {
    $visitor = hash('sha256', 'one-person');
    $startedAt = now()->startOfDay()->addHours(2);

    // The same person, three hours apart. The hourly rollup would call this
    // two unique listeners; a day is one.
    ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => $startedAt, 'visitor_hash' => $visitor,
    ]);
    ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => $startedAt->copy()->addHours(3), 'visitor_hash' => $visitor,
    ]);

    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=7')
        ->assertOk()
        ->assertJsonPath('data.totals.listeners', 1);
});

it('summarises countries from the rollup that outlives the raw rows', function () {
    ListenerGeoDaily::create([
        'station_id' => $this->station->id,
        'day' => now()->subDay()->toDateString(),
        'country' => 'GB',
        'sessions' => 40,
        'listener_seconds' => 90_000,
    ]);
    ListenerGeoDaily::create([
        'station_id' => $this->station->id,
        'day' => now()->toDateString(),
        'country' => 'GB',
        'sessions' => 10,
        'listener_seconds' => 20_000,
    ]);
    ListenerGeoDaily::create([
        'station_id' => $this->station->id,
        'day' => now()->toDateString(),
        'country' => 'US',
        'sessions' => 25,
        'listener_seconds' => 50_000,
    ]);

    $response = actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=30')
        ->assertOk()
        ->assertJsonPath('data.countries.rows.0.country', 'GB')
        ->assertJsonPath('data.countries.rows.0.sessions', 50)
        ->assertJsonPath('data.countries.rows.1.country', 'US');

    // Drives the "country lookup isn't configured" empty state — the screen
    // has to tell that apart from an empty room.
    expect($response->json('data.countries.total'))->toBe(75);
});

it('breaks down devices and browsers, skipping rows it could not parse', function () {
    ListenerSession::factory()->count(3)->for($this->station)->closed(300)->create([
        'started_at' => now()->subHours(2), 'device' => 'mobile', 'browser' => 'Chrome',
    ]);
    ListenerSession::factory()->for($this->station)->closed(300)->create([
        'started_at' => now()->subHours(2), 'device' => 'desktop', 'browser' => 'Firefox',
    ]);
    ListenerSession::factory()->for($this->station)->closed(300)->create([
        'started_at' => now()->subHours(2), 'device' => null, 'browser' => null,
    ]);

    $response = actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=7')
        ->assertOk()
        ->assertJsonPath('data.devices.rows.0.label', 'mobile')
        ->assertJsonPath('data.devices.rows.0.sessions', 3)
        // The unparsed row is outside the denominator too, not just the list.
        ->assertJsonPath('data.devices.total', 4);

    // The unparsed row is absent rather than an "Unknown" bucket that would
    // often be the largest entry in the list.
    expect(collect($response->json('data.devices.rows'))->pluck('label')->all())
        ->toEqualCanonicalizing(['mobile', 'desktop']);
});

it('averages only sessions that have finished', function () {
    ListenerSession::factory()->for($this->station)->closed(600)->create([
        'started_at' => now()->subHours(3),
    ]);
    // Still listening: seconds is 0 until the sweep closes it, so averaging it
    // in would drag the figure down in proportion to the live audience.
    ListenerSession::factory()->for($this->station)->create([
        'started_at' => now()->subMinutes(5),
    ]);

    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=7')
        ->assertOk()
        ->assertJsonPath('data.totals.avg_listen_seconds', 600);
});

it('excludes another station\'s audience', function () {
    $other = Station::factory()->for($this->user, 'user')->create(['slug' => 'rock']);

    ListenerStatHourly::create([
        'station_id' => $other->id,
        'hour' => now()->subHour()->startOfHour(),
        'peak_listeners' => 99,
        'listener_minutes' => 5_000,
        'sampled_minutes' => 60,
    ]);

    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=7')
        ->assertOk()
        ->assertJsonPath('data.totals.listener_minutes', 0)
        ->assertJsonPath('data.totals.peak', 0);
});

it('locks the window for a free plan but still answers with the live figures', function () {
    $this->user->update(['plan_id' => $this->free->id]);

    ListenerStatHourly::create([
        'station_id' => $this->station->id,
        'hour' => now()->subHour()->startOfHour(),
        'peak_listeners' => 12,
        'listener_minutes' => 300,
        'sampled_minutes' => 60,
    ]);

    $response = actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=90')
        ->assertOk()
        ->assertJsonPath('data.locked', true)
        ->assertJsonPath('data.plan_days', 0)
        // Collection was never gated: the peak is real and visible today.
        ->assertJsonPath('data.peak_all_time', 12);

    // Nothing a free account may not see is serialised at all, so the gate
    // cannot be lifted by editing the response.
    expect($response->json('data'))
        ->not->toHaveKey('daily')
        ->not->toHaveKey('countries')
        ->not->toHaveKey('totals');
});

it('treats a plan that never configured a window as free', function () {
    // `users.plan_id` is NOT NULL, so a genuinely plan-less account cannot
    // exist in the database — but a tier seeded without touching the column
    // can, and it must default to locked rather than to the full window.
    $this->user->update(['plan_id' => Plan::factory()->create()->id]);

    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience')
        ->assertOk()
        ->assertJsonPath('data.locked', true)
        ->assertJsonPath('data.plan_days', 0);
});

it('narrows an oversized window to the plan instead of rejecting it', function () {
    $this->user->plan->update(['analytics_days' => 30]);

    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=90')
        ->assertOk()
        ->assertJsonPath('data.range_days', 30)
        ->assertJsonPath('data.plan_days', 30);
});

it('falls back to the plan window for a range it does not offer', function () {
    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=3650')
        ->assertOk()
        ->assertJsonPath('data.range_days', 90);
});

it('caps the window at the raw-row retention period', function () {
    config(['analytics.retention_days' => 30]);
    $this->user->plan->update(['analytics_days' => 90]);

    // A wider window would draw a real listening-time chart beside country and
    // device columns that quietly stop partway.
    actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=90')
        ->assertOk()
        ->assertJsonPath('data.range_days', 30);
});

it('refuses a station belonging to someone else', function () {
    $intruder = User::factory()->create(['plan_id' => $this->pro->id]);

    actingAs($intruder)
        ->getJson('/api/stations/jazz/audience')
        ->assertForbidden();
});

it('requires authentication', function () {
    $this->getJson('/api/stations/jazz/audience')->assertUnauthorized();
});

it('reports a breakdown total that outlives the truncated list', function () {
    // Fifteen countries, a list that stops at twelve. Summing the rows would
    // report the largest twelve as if they were the whole audience.
    $codes = ['GB', 'US', 'DE', 'FR', 'BR', 'JP', 'CA', 'AU', 'NL', 'SE', 'ES', 'IT', 'PL', 'IE', 'NO'];

    foreach ($codes as $i => $code) {
        ListenerGeoDaily::create([
            'station_id' => $this->station->id,
            'day' => now()->toDateString(),
            'country' => $code,
            'sessions' => 20 - $i,
            'listener_seconds' => 1_000,
        ]);
    }

    $response = actingAs($this->user)
        ->getJson('/api/stations/jazz/audience?days=7')
        ->assertOk();

    expect($response->json('data.countries.rows'))->toHaveCount(12)
        ->and($response->json('data.countries.total'))->toBe(array_sum(range(6, 20)));
});
