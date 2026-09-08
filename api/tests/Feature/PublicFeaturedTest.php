<?php

use App\Models\Station;

it('includes a featured station running AutoDJ, with nobody at the microphone', function () {
    // The whole point of dropping the live requirement: this station is on
    // air and audible, it just has no human publishing into it.
    $station = Station::factory()->featured()->running()->create(['name' => 'AutoDJ FM']);

    $this->getJson('/api/public/featured')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.slug', $station->slug)
        ->assertJsonPath('data.0.is_live', false)
        ->assertJsonPath('data.0.is_on_air', true);
});

it('leaves out featured stations that are powered off', function () {
    Station::factory()->featured()->create(['desired_state' => Station::STATE_STOPPED]);

    $this->getJson('/api/public/featured')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('leaves out stations that are on air but not featured', function () {
    Station::factory()->running()->create();

    $this->getJson('/api/public/featured')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('puts live broadcasts at the front of the rail', function () {
    // Featured later, so it wins on recency too — and must still lose to the
    // live station, which is what pins the ordering to live-ness first.
    $autodj = Station::factory()->running()->create([
        'name' => 'AutoDJ FM',
        'featured' => true,
        'featured_at' => now(),
    ]);

    $live = Station::factory()->running()->live()->create([
        'name' => 'Live FM',
        'featured' => true,
        'featured_at' => now()->subDay(),
    ]);

    $this->getJson('/api/public/featured')
        ->assertOk()
        ->assertJsonPath('data.0.slug', $live->slug)
        ->assertJsonPath('data.1.slug', $autodj->slug);
});

it('orders the rest by most recently featured', function () {
    $older = Station::factory()->running()->create([
        'featured' => true,
        'featured_at' => now()->subWeek(),
    ]);

    $newer = Station::factory()->running()->create([
        'featured' => true,
        'featured_at' => now(),
    ]);

    $this->getJson('/api/public/featured')
        ->assertOk()
        ->assertJsonPath('data.0.slug', $newer->slug)
        ->assertJsonPath('data.1.slug', $older->slug);
});

it('sorts a station featured before the timestamp existed to the back', function () {
    // Rows the backfill could not date, or that predate it entirely. MySQL
    // sorts NULL first on a DESC, which would put the least-known pick at the
    // head of the rail.
    $undated = Station::factory()->running()->create([
        'featured' => true,
        'featured_at' => null,
    ]);

    $dated = Station::factory()->running()->create([
        'featured' => true,
        'featured_at' => now()->subYear(),
    ]);

    $this->getJson('/api/public/featured')
        ->assertOk()
        ->assertJsonPath('data.0.slug', $dated->slug)
        ->assertJsonPath('data.1.slug', $undated->slug);
});

it('truncates to the rail size deterministically', function () {
    // One more than there are slots, all identical apart from when they were
    // featured — so which one falls off is a property of the ordering rather
    // than of whatever the storage engine returned.
    $stations = collect(range(0, Station::FEATURED_RAIL_SIZE))
        ->map(fn (int $i) => Station::factory()->running()->create([
            'featured' => true,
            'featured_at' => now()->subMinutes($i),
        ]));

    $response = $this->getJson('/api/public/featured')
        ->assertOk()
        ->assertJsonCount(Station::FEATURED_RAIL_SIZE, 'data');

    expect(collect($response->json('data'))->pluck('slug')->all())
        ->toBe($stations->take(Station::FEATURED_RAIL_SIZE)->pluck('slug')->all());
});

it('tells every visitor whether a station is featured', function () {
    $station = Station::factory()->featured()->running()->create();

    // Public and unauthenticated: the badge has to render for a stranger who
    // arrived on a shared link, not only for the station's owner.
    $this->getJson("/api/public/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonPath('data.featured', true);
});

it('reports a station nobody picked as not featured', function () {
    $station = Station::factory()->running()->create();

    $this->getJson("/api/public/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonPath('data.featured', false);
});

it('keeps the badge on a featured station that is off air', function () {
    // The rail drops it, because it is not audible. The flag is the editorial
    // decision and outlives the power switch — the station page still says it
    // was picked.
    $station = Station::factory()->featured()->create(['desired_state' => Station::STATE_STOPPED]);

    $this->getJson("/api/public/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonPath('data.featured', true)
        ->assertJsonPath('data.is_on_air', false);
});
