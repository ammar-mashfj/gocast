<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use App\Services\StationLifecycleService;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-lifecycle-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

it('records intent before touching docker so a failed start is retried', function () {
    // The whole desired-state design rests on this: if `docker run` fails,
    // the station still WANTS to be running and stations:reconcile brings it
    // up within minutes. Recording intent afterwards would lose the station.
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('isRunning')->andReturn(false);
    $supervisor->shouldReceive('up')->once()->andThrow(new RuntimeException('daemon busy'));
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    expect(fn () => app(StationLifecycleService::class)->start($station))
        ->toThrow(RuntimeException::class);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('does not restart a healthy container when start is pressed twice', function () {
    // up() always restarts, and a restart drops every connected listener.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('isRunning')->andReturn(true);
    $supervisor->shouldNotReceive('up');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    app(StationLifecycleService::class)->start($station);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('brings a station back up when its container has died', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('isRunning')->andReturn(false);
    $supervisor->shouldReceive('up')->once();
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    app(StationLifecycleService::class)->ensureRunning($station);
});

it('stops the container and records the intent', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
        'started_at' => now(),
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('down')->once();
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    app(StationLifecycleService::class)->stop($station);

    $station->refresh();

    expect($station->desired_state)->toBe(Station::STATE_STOPPED)
        ->and($station->started_at)->toBeNull();
});

it('force-stops a live station for the idle reaper', function () {
    $station = Station::factory()->for(User::factory(), 'user')->live()->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    app(StationLifecycleService::class)->stop($station, force: true);

    expect($station->refresh()->desired_state)->toBe(Station::STATE_STOPPED);
});
