<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

/**
 * The create page's link preview. It must show the link creating would
 * mint — the same method is behind both — including the -2 a taken name
 * gets, since the owner cannot change the link and should not be surprised
 * by it on the overview.
 */
beforeEach(function () {
    Plan::updateOrCreate(['id' => 1], ['name' => 'Free', 'slug' => 'free', 'max_stations' => 10, 'max_listeners' => 100]);
    Sanctum::actingAs(User::factory()->create(['plan_id' => 1]));
});

it('previews the link a name would get', function () {
    $this->getJson('/api/stations/slug-preview?name='.urlencode('  Night Owl Radio! '))
        ->assertOk()
        ->assertJsonPath('data.slug', 'night-owl-radio');
});

it('previews the numbered link when the name is taken, counting deleted stations', function () {
    $owner = User::factory()->create(['plan_id' => 1]);
    Station::factory()->for($owner)->create(['slug' => 'jazz']);
    Station::factory()->for($owner)->create(['slug' => 'jazz-2'])->delete();

    $this->getJson('/api/stations/slug-preview?name=Jazz')
        ->assertOk()
        ->assertJsonPath('data.slug', 'jazz-3');

    // And creating under that name lands exactly there.
    $response = $this->postJson('/api/stations', ['name' => 'Jazz'])->assertCreated();
    expect($response->json('data.slug'))->toBe('jazz-3');
});

it('answers null for an empty name and "station" for one with no slug-safe characters', function () {
    $this->getJson('/api/stations/slug-preview?name=')->assertOk()->assertJsonPath('data.slug', null);
    $this->getJson('/api/stations/slug-preview?name='.urlencode('🎵🎵'))->assertOk()->assertJsonPath('data.slug', 'station');
});

it('ignores a slug sent with the create request', function () {
    $response = $this->postJson('/api/stations', ['name' => 'Night Owl Radio', 'slug' => 'owls'])->assertCreated();

    expect($response->json('data.slug'))->toBe('night-owl-radio');
});
