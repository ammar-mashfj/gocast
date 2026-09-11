<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;

/**
 * Deleting an account has to reach the stations it owns.
 *
 * The user row is only anonymised and soft-deleted, so without a cascade the
 * stations keep their containers, keep streaming to anyone holding the URL,
 * and keep their place in the public directory — owned by an account that no
 * longer exists and can no longer take them down.
 */
function deletableUser(): User
{
    Notification::fake();

    return User::factory()->create([
        'password' => Hash::make('old-pass'),
    ]);
}

it('takes a running station off air when its owner deletes their account', function () {
    $user = deletableUser();
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('down')
        ->once()
        ->withArgs(fn (Station $s) => $s->is($station));
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => $user->email])
        ->assertSuccessful();

    expect(Station::withTrashed()->findOrFail($station->id)->trashed())->toBeTrue();
});

it('removes a deleted account\'s stations from the public directory', function () {
    $user = deletableUser();
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    getJson('/api/public/stations')
        ->assertOk()
        ->assertJsonPath('data.0.slug', $station->slug);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => $user->email])
        ->assertSuccessful();

    getJson('/api/public/stations')
        ->assertOk()
        ->assertJsonCount(0, 'data');

    getJson("/api/public/stations/{$station->slug}")->assertNotFound();
});

it('leaves another account\'s stations alone', function () {
    $user = deletableUser();
    $bystander = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => $user->email])
        ->assertSuccessful();

    expect($bystander->fresh()->trashed())->toBeFalse();
});

it('deletes stations one at a time so each container is actually torn down', function () {
    // The regression this guards: `$user->stations()->delete()` is a mass
    // delete on the query builder and fires no model events, so
    // StationObserver::deleting never runs and every container is orphaned.
    $user = deletableUser();
    $stations = Station::factory()->count(3)->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('down')->times(3);
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => $user->email])
        ->assertSuccessful();

    expect(Station::whereIn('id', $stations->pluck('id'))->count())->toBe(0);
    expect(Station::withTrashed()->whereIn('id', $stations->pluck('id'))->count())->toBe(3);
});
