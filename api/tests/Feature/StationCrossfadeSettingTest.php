<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The owner's crossfade switch rides on the station update endpoint. It only
 * shapes AutoDJ and restarts the station, so it is gated like jingles.
 * proOwner() lives in StationJingleSettingsTest.
 */
function freeOwner(): User
{
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    return User::factory()->create(['plan_id' => $plan->id]);
}

it('defaults to on for a new station', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create()->fresh();

    expect($station->crossfade_enabled)->toBeTrue();
});

it('lets a pro owner turn crossfade off', function () {
    config(['liquidsoap.crossfade_enabled' => true]);
    $owner = proOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['crossfade_enabled' => false])
        ->assertOk()
        ->assertJsonPath('data.crossfade_enabled', false)
        ->assertJsonPath('data.crossfade_available', true);

    expect($station->fresh()->crossfade_enabled)->toBeFalse();
});

it('refuses the switch to an owner without autodj', function () {
    $owner = freeOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['crossfade_enabled' => false])
        ->assertForbidden()
        ->assertJsonPath('code', 'autodj_not_available');

    expect($station->fresh()->crossfade_enabled)->toBeTrue();
});

it('lets the rest of the form resend the unchanged value on any plan', function () {
    $owner = freeOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['crossfade_enabled' => true, 'genre' => 'Jazz'])
        ->assertOk();
});
