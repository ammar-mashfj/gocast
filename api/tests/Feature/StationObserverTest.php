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
