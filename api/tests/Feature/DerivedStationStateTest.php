<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use App\Services\StationStatusService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Redis;

use function Pest\Laravel\getJson;

/**
 * Live-ness and on-air-ness are derived, never stored.
 *
 * These cover the two halves of that: the cheap tier (StationResource, which
 * answers from owner intent plus an open StreamSession) and the authoritative
 * tier (the listeners endpoint, which asks the container over harbor).
 */
function onAirStation(array $attributes = []): Station
{
    return Station::factory()->for(User::factory(), 'user')->create(array_merge([
        'desired_state' => Station::STATE_RUNNING,
    ], $attributes));
}

/**
 * Stand in for the Docker daemon. `$status` is what `docker inspect` would
 * report for the station's container — 'running', 'restarting', 'absent' —
 * or an exception to model a daemon we cannot reach at all.
 */
function fakeContainerStatus(string|Throwable $status): void
{
    test()->mock(LiquidsoapSupervisor::class, function ($mock) use ($status) {
        $mock->shouldReceive('containerHost')->andReturn('station-host');
        $mock->shouldReceive('containerName')->andReturn('gocast-liquidsoap-test');

        $expectation = $mock->shouldReceive('containerState');

        $status instanceof Throwable
            ? $expectation->andThrow($status)
            : $expectation->andReturn([
                'exists' => $status !== 'absent',
                'status' => $status,
                'health' => 'none',
                'exit_code' => 0,
                'oom_killed' => false,
                'restart_count' => 0,
            ]);
    });
}

beforeEach(function () {
    Http::preventStrayRequests();
});

it('reports a running station on air even with an empty playlist and no metadata', function () {
    // The regression this whole change exists for: a station whose AutoDJ
    // playlist is empty produces silence, never fires on_metadata, and so has
    // no now-playing key. It is still on air — its Icecast mount exists and a
    // listener who presses play stays connected.
    $station = onAirStation(['slug' => 'silent-fm']);
    Redis::del("metadata:{$station->id}");

    getJson('/api/public/stations/silent-fm')
        ->assertOk()
        ->assertJsonPath('data.is_on_air', true)
        ->assertJsonPath('data.state', 'on_air')
        ->assertJsonPath('data.is_live', false)
        ->assertJsonPath('data.now_playing', null);
});

it('reports a stopped station offline even when stale metadata lingers', function () {
    // The one guard that mattered on is_on_air: intent. Redis can still hold
    // the last track of a station taken off air hours ago.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'stopped-fm',
        'desired_state' => Station::STATE_STOPPED,
    ]);
    Redis::set("metadata:{$station->id}", json_encode(['title' => 'Ghost', 'artist' => 'Stale']));

    getJson('/api/public/stations/stopped-fm')
        ->assertOk()
        ->assertJsonPath('data.is_on_air', false)
        ->assertJsonPath('data.state', 'offline')
        ->assertJsonPath('data.now_playing', null);

    Redis::del("metadata:{$station->id}");
});

it('derives is_live from an open stream session, not a column', function () {
    $station = onAirStation(['slug' => 'live-fm']);

    getJson('/api/public/stations/live-fm')->assertJsonPath('data.is_live', false);

    $session = $station->streamSessions()->create([
        'started_at' => now(),
        'source_type' => 'browser',
    ]);

    getJson('/api/public/stations/live-fm')
        ->assertJsonPath('data.is_live', true)
        ->assertJsonPath('data.state', 'live');

    $session->update(['ended_at' => now()]);

    getJson('/api/public/stations/live-fm')
        ->assertJsonPath('data.is_live', false)
        ->assertJsonPath('data.state', 'on_air');
});

it('never reports a stopped station as live, even with a session left open', function () {
    // A stranded session is the failure the reconciler repairs. Until it does,
    // owner intent still wins — nobody can hear a station with no container.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'stranded-fm',
        'desired_state' => Station::STATE_STOPPED,
    ]);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    getJson('/api/public/stations/stranded-fm')
        ->assertJsonPath('data.is_live', false)
        ->assertJsonPath('data.state', 'offline');
});

it('asks the container for the listener-facing state and reports silence as on air', function () {
    $station = onAirStation(['slug' => 'poll-fm']);
    Http::fake(['*/status' => Http::response([
        'ready' => true,
        'icecast' => true,
        'source' => 'silence',
        'title' => '',
        'artist' => '',
    ], 200)]);

    getJson('/api/public/stations/poll-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'on_air')
        ->assertJsonPath('data.is_on_air', true)
        ->assertJsonPath('data.is_live', false);
});

it('reports a station whose icecast connection dropped as degraded, not on air', function () {
    // The audio graph is fine but nothing is carrying it, so there is no mount
    // for a listener to connect to. Claiming on_air here would promise audio
    // that does not exist.
    $station = onAirStation(['slug' => 'degraded-fm']);
    Http::fake(['*/status' => Http::response([
        'ready' => true,
        'icecast' => false,
        'source' => 'playlist',
    ], 200)]);

    getJson('/api/public/stations/degraded-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'degraded')
        ->assertJsonPath('data.is_on_air', false);
});

it('reports live and prefers harbor metadata over the redis copy', function () {
    $station = onAirStation(['slug' => 'mic-fm']);
    Redis::set("metadata:{$station->id}", json_encode(['title' => 'Stale', 'artist' => 'Old']));

    Http::fake(['*/status' => Http::response([
        'ready' => true,
        'icecast' => true,
        'source' => 'live',
        'title' => 'Fresh Take',
        'artist' => 'On The Mic',
    ], 200)]);

    getJson('/api/public/stations/mic-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'live')
        ->assertJsonPath('data.is_live', true)
        ->assertJsonPath('data.is_on_air', true)
        ->assertJsonPath('data.now_playing.title', 'Fresh Take');

    Redis::del("metadata:{$station->id}");
});

it('reports an unreachable container as starting rather than on air', function () {
    // The container is up (LiquidsoapSupervisor reports `running` in tests),
    // it just hasn't answered yet. That is genuinely booting.
    $station = onAirStation(['slug' => 'booting-fm']);
    Http::fake(['*/status' => Http::response('', 500)]);

    getJson('/api/public/stations/booting-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'starting')
        ->assertJsonPath('data.is_on_air', false);
});

it('reports a station whose container is gone as offline, not starting forever', function () {
    // Intent says running, but there is no container — a host that rebooted,
    // a crash, or a reconciler that hit its recreate cap and gave up. Calling
    // that "starting" left the dashboard promising "a few seconds" indefinitely
    // with no way out. It is off air, and the owner can press start.
    onAirStation(['slug' => 'vanished-fm']);
    Http::fake(['*/status' => Http::response('', 500)]);
    fakeContainerStatus('absent');

    getJson('/api/public/stations/vanished-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'offline')
        ->assertJsonPath('data.is_on_air', false);
});

it('does not call a crash-looping container on air', function () {
    // `restarting` is what Docker reports for a container looping on a broken
    // script. Nobody should be told to publish into it.
    onAirStation(['slug' => 'looping-fm']);
    Http::fake(['*/status' => Http::response('', 500)]);

    fakeContainerStatus('restarting');

    getJson('/api/public/stations/looping-fm/listeners')
        ->assertJsonPath('data.state', 'offline');
});

it('keeps a station on air when docker itself cannot be reached', function () {
    // Failing to ask Docker is a fault in our tooling, not evidence about the
    // station. Reporting offline here would send an owner chasing a station
    // that is fine.
    onAirStation(['slug' => 'blind-fm']);
    Http::fake(['*/status' => Http::response('', 500)]);

    fakeContainerStatus(new RuntimeException('docker daemon unreachable'));

    getJson('/api/public/stations/blind-fm/listeners')
        ->assertJsonPath('data.state', 'starting');
});

/*
|--------------------------------------------------------------------------
| Cost of asking
|--------------------------------------------------------------------------
|
| Harbor's address is COMPUTED, not discovered: containerIp() derives it from
| the station's container_index and never consults Docker. So a station whose
| container is gone points at an IP nothing holds, and the Docker bridge drops
| those packets silently rather than refusing them — the connect cannot fail
| fast, it burns the whole harbor timeout. Measured at 1.5s against a ~20ms
| local `docker inspect`.
|
| That made a stopped-but-still-desired-running station cost more to ask about
| than a healthy one, on every poll, for every viewer. These cover the two
| defences: ask Docker first, and remember a confirmed-down answer.
*/

it('never dials a container docker says is gone', function () {
    // The dial is the expensive part, and it is pure waste here: we already
    // know from Docker that nothing is listening at the address we would use.
    onAirStation(['slug' => 'novel-fm']);
    Http::fake();
    fakeContainerStatus('absent');

    getJson('/api/public/stations/novel-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'offline');

    Http::assertNothingSent();
});

it('still dials harbor when docker says the container is up', function () {
    // The guard above must not cost us the normal path: a running container
    // is exactly the case where harbor has something to tell us.
    onAirStation(['slug' => 'present-fm']);
    Http::fake(['*/status' => Http::response(['ready' => true, 'source' => 'autodj'], 200)]);

    getJson('/api/public/stations/present-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'on_air');

    Http::assertSentCount(1);
});

it('holds a confirmed-down verdict instead of re-deriving it every poll', function () {
    // "Docker says the container is gone" does not go stale on its own —
    // only an explicit start changes it, and start already calls forget().
    // Re-deriving it on the 2s status TTL meant every viewer of a dead
    // station re-ran the whole probe twice a poll cycle for the same answer.
    $station = onAirStation(['slug' => 'held-fm']);
    Http::fake();
    fakeContainerStatus('absent');

    expect(app(StationStatusService::class)->state($station))->toBe('offline');

    $key = 'station-status:'.$station->id;

    // Well past status_ttl_seconds (2s) — a normal status would be gone.
    test()->travel(5)->seconds();
    expect(Cache::get($key))->not->toBeNull();

    // Past status_down_ttl_seconds (15s) — re-checked, so a container that
    // came back outside our knowledge is still picked up.
    test()->travel(11)->seconds();
    expect(Cache::get($key))->toBeNull();
});

it('keeps a silent but running container on the short ttl', function () {
    // The long TTL is only for a verdict DOCKER confirmed. A container that is
    // up but not answering yet is booting — the one state that changes second
    // to second — and must not be pinned to a 15s stale answer.
    $station = onAirStation(['slug' => 'booting-ttl-fm']);
    Http::fake(['*/status' => Http::response('', 500)]);

    expect(app(StationStatusService::class)->state($station))->toBe('starting');

    test()->travel(5)->seconds();

    expect(Cache::get('station-status:'.$station->id))->toBeNull();
});
