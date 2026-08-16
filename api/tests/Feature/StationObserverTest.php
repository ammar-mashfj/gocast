<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;

it('reports inTestMode while running tests', function () {
    // StationObserver::created() short-circuits on this flag — if it ever
    // flips to false during a test run, factories will spawn real
    // Liquidsoap containers on the host docker daemon
    // (see the supervisor test guard note in api/CLAUDE.md).
    expect(LiquidsoapSupervisor::inTestMode())->toBeTrue();
});

it('does not create a per-station playlist directory when a station is created in tests', function () {
    // Point the writer at a tmp dir we own, then assert the directory was
    // never materialized — proving the observer guarded out before invoking
    // PlaylistFileWriter / LiquidsoapSupervisor.
    $tmp = sys_get_temp_dir().'/gocast-observer-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $tmp]);

    $station = Station::factory()->for(User::factory(), 'user')->create();

    expect(is_dir($tmp.'/'.$station->slug))->toBeFalse();
});

it('does not spawn a container when a station is created', function () {
    // Creating a station is configuration, not a broadcast. Nothing should
    // reach the daemon until the owner presses start.
    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('up');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $station = Station::factory()->for(User::factory(), 'user')->create();

    expect($station->desired_state)->toBe(Station::STATE_STOPPED);
});

it('does not restart a stopped station when its settings change', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('up');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    // up() re-renders the .liq from scratch, so the new genre lands whenever
    // the owner next starts the station — no container needed now.
    $station->update(['genre' => 'Ambient']);
});

it('restarts a running station when its settings change', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('up')->once();
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $station->update(['genre' => 'Ambient']);
});

it('ignores changes that do not affect the generated script', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('up');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    // Going live opens a StreamSession rather than touching the stations row,
    // so the broadcast webhooks cannot reach the observer at all — restarting
    // there would kick every listener off mid-stream.
    $station->streamSessions()->create([
        'started_at' => now(),
        'source_type' => 'browser',
    ]);

    // `featured` is not baked into the rendered .liq, so it must not restart.
    $station->update(['featured' => true]);
});

it('tears down the old container when a running station is renamed', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'old-name',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('downBySlug')->once()->with('old-name');
    $supervisor->shouldReceive('up')->once();
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $station->update(['slug' => 'new-name']);
});

it('wipes the rendered script and hls directory when a station is hard-deleted', function () {
    // These outlive the station otherwise — small individually, unbounded
    // across every station ever deleted, on the disk that also holds the
    // track libraries.
    $liqDir = sys_get_temp_dir().'/gocast-liq-'.uniqid();
    $hlsDir = sys_get_temp_dir().'/gocast-hls-'.uniqid();
    config(['liquidsoap.liq_dir' => $liqDir, 'liquidsoap.hls_dir' => $hlsDir]);

    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'to-be-erased']);

    File::ensureDirectoryExists($liqDir);
    File::ensureDirectoryExists("{$hlsDir}/to-be-erased");
    File::put("{$liqDir}/to-be-erased.liq", '# script');
    File::put("{$hlsDir}/to-be-erased/segment-1.ts", 'audio');

    $station->forceDelete();

    expect(file_exists("{$liqDir}/to-be-erased.liq"))->toBeFalse()
        ->and(is_dir("{$hlsDir}/to-be-erased"))->toBeFalse();

    File::deleteDirectory($liqDir);
    File::deleteDirectory($hlsDir);
});

it('keeps the script and segments when a station is only soft-deleted', function () {
    // A soft delete is recoverable; wiping its artifacts would not be.
    $liqDir = sys_get_temp_dir().'/gocast-liq-'.uniqid();
    config(['liquidsoap.liq_dir' => $liqDir]);

    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'just-hidden']);

    File::ensureDirectoryExists($liqDir);
    File::put("{$liqDir}/just-hidden.liq", '# script');

    $station->delete();

    expect(file_exists("{$liqDir}/just-hidden.liq"))->toBeTrue();

    File::deleteDirectory($liqDir);
});
