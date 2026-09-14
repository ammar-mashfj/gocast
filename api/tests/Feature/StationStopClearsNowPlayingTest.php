<?php

use App\Models\Station;
use App\Models\User;
use App\Services\StationLifecycleService;
use Illuminate\Support\Facades\Redis;

/**
 * Stopping a station must take its now-playing payload with it.
 *
 * This is not cosmetic. ListenerCountController falls back to the Redis copy
 * whenever the container is unreachable — which is always, once it is gone —
 * so a stale key makes a stopped station keep reporting a track to the public
 * API for up to the six-hour TTL. The player page reads a non-null title as
 * "audible" and hides the whole off-air block: the Off air badge AND the
 * notify-me opt-in. The one moment a listener most wants to be told about the
 * next broadcast is the moment the UI for it vanishes.
 *
 * Every other path that clears this key needs the CONTAINER to report in, and
 * a container being torn down has no reliable chance to.
 */
it('clears the now-playing payload when a station is stopped', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $key = "metadata:{$station->id}";
    Redis::setex($key, 3600, json_encode(['title' => 'Last Track', 'artist' => 'Somebody']));

    app(StationLifecycleService::class)->stop($station);

    expect(Redis::get($key))->toBeNull();
});

it('clears it even when the container never reported a shutdown', function () {
    // The normal case, not the edge case: a killed container, or one that had
    // already crashed, sends nothing at all on its way out.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $key = "metadata:{$station->id}";
    Redis::setex($key, 3600, json_encode(['title' => 'Orphaned Track', 'artist' => null]));

    // No station-event webhook, no empty now-playing push — just the stop.
    app(StationLifecycleService::class)->stop($station, force: true, reason: 'silent');

    expect(Redis::get($key))->toBeNull()
        ->and($station->fresh()->desired_state)->toBe(Station::STATE_STOPPED);
});

it('leaves another station now-playing alone', function () {
    $stopped = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);
    $running = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    Redis::setex("metadata:{$stopped->id}", 3600, json_encode(['title' => 'A', 'artist' => null]));
    Redis::setex("metadata:{$running->id}", 3600, json_encode(['title' => 'B', 'artist' => null]));

    app(StationLifecycleService::class)->stop($stopped);

    expect(Redis::get("metadata:{$stopped->id}"))->toBeNull()
        ->and(Redis::get("metadata:{$running->id}"))->not->toBeNull();
});
