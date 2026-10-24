<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\File;

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

/**
 * A supervisor with telnet left to the test, writing scripts to a scratch
 * directory: applyCrossfadeSetting rewrites the station's .liq as it pushes.
 */
function crossfadeSupervisor(): LiquidsoapSupervisor
{
    $dir = sys_get_temp_dir().'/gocast-liq-'.uniqid();
    config(['liquidsoap.liq_dir' => $dir]);
    test()->beforeApplicationDestroyed(fn () => File::deleteDirectory($dir));

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->__construct();

    return $supervisor;
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

it('reports the live push as applied when liquidsoap confirms the set', function () {
    config(['liquidsoap.crossfade_enabled' => true]);
    $station = Station::factory()->for(User::factory(), 'user')->create(['crossfade_enabled' => false]);

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->once()
        ->with($station, 'var.set autodj_crossfade = false')
        ->andReturn("Variable autodj_crossfade set.\nEND\nBye!\n");

    expect($supervisor->applyCrossfadeSetting($station))->toBeTrue();
});

it('reports the live push as failed when the container has no such variable', function () {
    // A container started from an older script answers instead of dropping
    // the connection; the owner's toast must not claim the change landed.
    config(['liquidsoap.crossfade_enabled' => true]);
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->once()
        ->andReturn("Syntax error or variable not found.\nEND\nBye!\n");

    expect($supervisor->applyCrossfadeSetting($station))->toBeFalse();
});

it('rewrites the script on disk so a crash restart keeps the new value', function () {
    config(['liquidsoap.crossfade_enabled' => true]);
    $station = Station::factory()->for(User::factory(), 'user')->create(['crossfade_enabled' => false]);

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->andReturn("Variable autodj_crossfade set.\n");
    $supervisor->shouldNotReceive('restart');

    $supervisor->applyCrossfadeSetting($station);

    expect(file_get_contents(config('liquidsoap.liq_dir')."/{$station->slug}.liq"))
        ->toContain('interactive.bool("autodj_crossfade", false)');
});
