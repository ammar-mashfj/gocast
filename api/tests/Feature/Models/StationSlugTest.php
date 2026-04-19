<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    Plan::updateOrCreate(['id' => 1], ['name' => 'Free', 'slug' => 'free', 'max_stations' => 10, 'max_listeners' => 100]);
});

it('auto-generates a slug from the station name when none is provided', function () {
    $user = User::factory()->create(['plan_id' => 1]);
    $station = Station::factory()->for($user)->create(['name' => 'Cool Jazz Radio', 'slug' => null]);

    expect($station->slug)->toBe('cool-jazz-radio');
});

it('appends -2, -3, ... when the generated slug is taken', function () {
    $user = User::factory()->create(['plan_id' => 1]);
    Station::factory()->for($user)->create(['name' => 'Cool Jazz', 'slug' => 'cool-jazz']);
    $second = Station::factory()->for($user)->create(['name' => 'Cool Jazz', 'slug' => null]);
    $third = Station::factory()->for($user)->create(['name' => 'Cool Jazz', 'slug' => null]);

    expect($second->slug)->toBe('cool-jazz-2');
    expect($third->slug)->toBe('cool-jazz-3');
});

it('falls back to "station" when the name has no slug-safe characters', function () {
    $user = User::factory()->create(['plan_id' => 1]);
    $station = Station::factory()->for($user)->create(['name' => '🎵🎵', 'slug' => null]);

    expect($station->slug)->toBe('station');
});

it('avoids collisions with soft-deleted stations', function () {
    $user = User::factory()->create(['plan_id' => 1]);
    $first = Station::factory()->for($user)->create(['name' => 'Rebrand', 'slug' => 'rebrand']);
    $first->delete();

    $second = Station::factory()->for($user)->create(['name' => 'Rebrand', 'slug' => null]);

    expect($second->slug)->toBe('rebrand-2');
});

it('does not regenerate the slug when the station name is updated', function () {
    $user = User::factory()->create(['plan_id' => 1]);
    $station = Station::factory()->for($user)->create(['name' => 'Original Name', 'slug' => 'original-name']);

    $station->update(['name' => 'Completely Different']);

    expect($station->fresh()->slug)->toBe('original-name');
});

it('ignores a slug field in the update request', function () {
    $user = User::factory()->create(['plan_id' => 1]);
    $station = Station::factory()->for($user)->create(['name' => 'Locked URL', 'slug' => 'locked-url']);
    Sanctum::actingAs($user);

    $response = $this->putJson("/api/stations/{$station->slug}", [
        'name' => 'New Name',
        'slug' => 'attacker-chosen',
    ]);

    $response->assertOk();
    expect($station->fresh()->slug)->toBe('locked-url');
});

it('auto-generates a slug when creating via the API', function () {
    $user = User::factory()->create(['plan_id' => 1]);
    Sanctum::actingAs($user);

    $response = $this->postJson('/api/stations', [
        'name' => 'Brand New Station',
    ]);

    $response->assertCreated();
    expect($response->json('data.slug'))->toBe('brand-new-station');
});
