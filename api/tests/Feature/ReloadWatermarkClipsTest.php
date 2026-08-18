<?php

use App\Jobs\ReloadWatermarkClips;
use App\Models\Station;
use App\Services\LiquidsoapSupervisor;

it('reloads the watermark source on every running station', function () {
    $running = Station::factory()->create(['desired_state' => Station::STATE_RUNNING]);
    Station::factory()->create(['desired_state' => Station::STATE_STOPPED]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldReceive('telnet')
        ->once()
        ->withArgs(fn (Station $station, string $command) => $station->is($running) && $command === 'watermark.reload')
        ->andReturn('');

    (new ReloadWatermarkClips)->handle($supervisor);
});

it('does nothing when watermarking is switched off for the install', function () {
    config(['liquidsoap.watermark_enabled' => false]);

    Station::factory()->create(['desired_state' => Station::STATE_RUNNING]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldNotReceive('telnet');

    (new ReloadWatermarkClips)->handle($supervisor);
});

/**
 * A container that is down or wedged must not stop the fan-out: the rest of
 * the fleet still needs telling, and the missed one re-reads the directory
 * when it next boots.
 */
it('keeps going when one station is unreachable', function () {
    Station::factory()->count(2)->create(['desired_state' => Station::STATE_RUNNING]);

    $attempted = 0;

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldReceive('telnet')
        ->twice()
        ->andReturnUsing(function () use (&$attempted) {
            $attempted++;

            throw new RuntimeException('connect failed');
        });

    (new ReloadWatermarkClips)->handle($supervisor);

    expect($attempted)->toBe(2);
});
