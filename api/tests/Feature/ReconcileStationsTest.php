<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;

it('removes containers whose station rows are gone and leaves the rest alone', function () {
    $live = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'live-one']);
    $trashed = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'soft-deleted']);
    $trashed->delete();

    // Three containers: one for a real station, one for a soft-deleted
    // station (must be preserved for restore), one true orphan.
    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('listManagedContainers')
        ->andReturn([
            LiquidsoapSupervisor::CONTAINER_PREFIX.'live-one',
            LiquidsoapSupervisor::CONTAINER_PREFIX.'soft-deleted',
            LiquidsoapSupervisor::CONTAINER_PREFIX.'truly-gone',
        ]);
    $supervisor->shouldReceive('removeContainer')
        ->once()
        ->with(LiquidsoapSupervisor::CONTAINER_PREFIX.'truly-gone');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('Found 1 orphan')
        ->expectsOutputToContain('truly-gone')
        ->assertExitCode(0);
});

it('reports orphans without removing them in dry-run mode', function () {
    Station::factory()->for(User::factory(), 'user')->create(['slug' => 'kept']);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('listManagedContainers')
        ->andReturn([
            LiquidsoapSupervisor::CONTAINER_PREFIX.'kept',
            LiquidsoapSupervisor::CONTAINER_PREFIX.'orphan',
        ]);
    $supervisor->shouldNotReceive('removeContainer');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile', ['--dry-run' => true])
        ->expectsOutputToContain('dry run')
        ->expectsOutputToContain('orphan')
        ->assertExitCode(0);
});

it('no-ops when every container matches a station', function () {
    Station::factory()->for(User::factory(), 'user')->create(['slug' => 'a']);
    Station::factory()->for(User::factory(), 'user')->create(['slug' => 'b']);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('listManagedContainers')
        ->andReturn([
            LiquidsoapSupervisor::CONTAINER_PREFIX.'a',
            LiquidsoapSupervisor::CONTAINER_PREFIX.'b',
        ]);
    $supervisor->shouldNotReceive('removeContainer');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('Nothing to do')
        ->assertExitCode(0);
});
