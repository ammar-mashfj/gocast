<?php

use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\StationStatusService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

use function Pest\Laravel\actingAs;

/**
 * Status is pulled from the station's own Liquidsoap container over harbor
 * HTTP. Every test here fakes that HTTP call — nothing reaches a container.
 */
function harborReturns(array $payload): void
{
    Http::fake(['*/status' => Http::response($payload, 200)]);
}

function runningStation(User $user, array $attributes = []): Station
{
    return Station::factory()->for($user, 'user')->create(array_merge([
        'desired_state' => Station::STATE_RUNNING,
    ], $attributes));
}

it('does not call the container for a station that is off air', function () {
    // A stopped station has no container by definition; spending a socket to
    // discover that would make list endpoints pay for every idle station.
    Http::fake();

    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => Station::STATE_STOPPED,
    ]);

    expect(app(StationStatusService::class)->fetch($station))->toBeNull();

    Http::assertNothingSent();
});

it('reads what is playing straight from the container', function () {
    harborReturns([
        'ready' => true,
        'source' => 'autodj',
        'title' => 'Blue in Green',
        'artist' => 'Miles Davis',
        'elapsed' => 42.16,
        'remaining' => 128.4,
        'playlist_length' => 12,
        'up_next' => ['01H.mp3', '02H.mp3'],
    ]);

    $status = app(StationStatusService::class)->fetch(runningStation(User::factory()->create()));

    expect($status['ready'])->toBeTrue()
        ->and($status['source'])->toBe('autodj')
        ->and($status['title'])->toBe('Blue in Green')
        ->and($status['elapsed'])->toBe(42.2)
        ->and($status['playlist_length'])->toBe(12)
        ->and($status['up_next'])->toBe(['01H.mp3', '02H.mp3']);
});

it('authenticates to the container with the internal key', function () {
    config(['services.internal_api_key' => 'shared-secret']);
    harborReturns(['ready' => true, 'source' => 'autodj']);

    app(StationStatusService::class)->fetch(runningStation(User::factory()->create()));

    Http::assertSent(fn ($request) => $request->hasHeader('X-Internal-Key', 'shared-secret'));
});

it('turns empty metadata and unknown durations into nulls', function () {
    // Liquidsoap reports "" for absent metadata and -1 for an unknown
    // remaining time; neither should reach the API as a magic value.
    harborReturns([
        'ready' => true,
        'source' => 'silence',
        'title' => '',
        'artist' => '',
        'elapsed' => 0,
        'remaining' => -1,
    ]);

    $status = app(StationStatusService::class)->fetch(runningStation(User::factory()->create()));

    expect($status['title'])->toBeNull()
        ->and($status['artist'])->toBeNull()
        ->and($status['remaining'])->toBeNull()
        ->and($status['elapsed'])->toBe(0.0);
});

it('treats an unreachable container as offline rather than an error', function () {
    Http::fake(fn () => throw new ConnectionException('Connection refused'));

    $service = app(StationStatusService::class);
    $station = runningStation(User::factory()->create());

    expect($service->fetch($station))->toBeNull()
        ->and($service->isReady($station))->toBeFalse();
});

it('caches a pulled status so a busy page does not hammer the containers', function () {
    harborReturns(['ready' => true, 'source' => 'autodj']);

    $service = app(StationStatusService::class);
    $station = runningStation(User::factory()->create());

    $service->fetch($station);
    $service->fetch($station);
    $service->fetch($station);

    Http::assertSentCount(1);
});

it('re-reads after a transition clears the cache', function () {
    harborReturns(['ready' => true, 'source' => 'autodj']);

    $service = app(StationStatusService::class);
    $station = runningStation(User::factory()->create());

    $service->fetch($station);
    $service->forget($station);
    $service->fetch($station);

    Http::assertSentCount(2);
});

it('derives the four station states', function (string $desired, ?array $payload, string $expected) {
    $payload === null
        ? Http::fake(fn () => throw new ConnectionException('down'))
        : harborReturns($payload);

    $station = Station::factory()->for(User::factory(), 'user')->create([
        'desired_state' => $desired,
    ]);

    expect(app(StationStatusService::class)->state($station))->toBe($expected);
})->with([
    'stopped station is offline' => [Station::STATE_STOPPED, ['ready' => true], 'offline'],
    'unreachable container is starting' => [Station::STATE_RUNNING, null, 'starting'],
    'container not ready yet is starting' => [Station::STATE_RUNNING, ['ready' => false], 'starting'],
    'autodj is on air' => [Station::STATE_RUNNING, ['ready' => true, 'source' => 'autodj'], 'on_air'],
    'broadcaster is live' => [Station::STATE_RUNNING, ['ready' => true, 'source' => 'live'], 'live'],
]);

it('serves the status endpoint with the queue resolved to real tracks', function () {
    $user = User::factory()->create();
    $station = runningStation($user);

    $first = Track::factory()->for($station)->create(['title' => 'Opener', 'artist' => 'A']);
    $second = Track::factory()->for($station)->create(['title' => 'Follow up', 'artist' => 'B']);

    harborReturns([
        'ready' => true,
        'source' => 'autodj',
        'title' => 'Opener',
        'artist' => 'A',
        'elapsed' => 10.0,
        'remaining' => 90.0,
        'playlist_length' => 2,
        'up_next' => [$first->path, $second->path],
    ]);

    actingAs($user)
        ->getJson("/api/stations/{$station->slug}/status")
        ->assertOk()
        ->assertJsonPath('data.state', 'on_air')
        ->assertJsonPath('data.reachable', true)
        ->assertJsonPath('data.now_playing.title', 'Opener')
        ->assertJsonPath('data.up_next.0.title', 'Opener')
        ->assertJsonPath('data.up_next.1.title', 'Follow up')
        ->assertJsonPath('data.up_next.1.id', $second->id);
});

it('keeps a queued track in the list when its row has gone', function () {
    // The queue is what it is — dropping entries would make "up next"
    // disagree with what listeners actually hear.
    $user = User::factory()->create();
    $station = runningStation($user);

    harborReturns([
        'ready' => true,
        'source' => 'autodj',
        'up_next' => ['01HDELETED.mp3'],
    ]);

    actingAs($user)
        ->getJson("/api/stations/{$station->slug}/status")
        ->assertOk()
        ->assertJsonPath('data.up_next.0.id', null)
        ->assertJsonPath('data.up_next.0.title', '01HDELETED.mp3');
});

it('reports an off-air station as offline without now-playing data', function () {
    Http::fake();

    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_STOPPED,
    ]);

    actingAs($user)
        ->getJson("/api/stations/{$station->slug}/status")
        ->assertOk()
        ->assertJsonPath('data.state', 'offline')
        ->assertJsonPath('data.reachable', false)
        ->assertJsonPath('data.now_playing', null)
        ->assertJsonPath('data.up_next', []);
});

/**
 * `ready` only ever meant "the audio graph is producing frames". If Icecast
 * rejects the source — wrong password, Icecast down, network partition — the
 * graph is perfectly ready and the mount does not exist, so the station was
 * reported as on air while no listener could hear a thing.
 */
it('reports a station that is producing audio but not reaching icecast as degraded', function () {
    $station = runningStation(User::factory()->create());

    harborReturns(['ready' => true, 'icecast' => false, 'source' => 'autodj']);

    expect(app(StationStatusService::class)->state($station))
        ->toBe(StationStatusService::STATE_DEGRADED);
});

it('still reports live when icecast is carrying the stream', function () {
    $station = runningStation(User::factory()->create());

    harborReturns(['ready' => true, 'icecast' => true, 'source' => 'live']);

    expect(app(StationStatusService::class)->state($station))
        ->toBe(StationStatusService::STATE_LIVE);
});

it('does not call a station degraded just because it predates the icecast field', function () {
    // Mid-rollout, containers started from the previous template answer
    // /status without an `icecast` key. Absent evidence of a problem, that is
    // not a fault — marking every one of them degraded would be a fleet-wide
    // false alarm.
    $station = runningStation(User::factory()->create());

    harborReturns(['ready' => true, 'source' => 'autodj']);

    expect(app(StationStatusService::class)->state($station))
        ->toBe(StationStatusService::STATE_ON_AIR);
});

it('surfaces the icecast connection through the status endpoint', function () {
    $user = User::factory()->create();
    $station = runningStation($user);

    harborReturns(['ready' => true, 'icecast' => false, 'source' => 'autodj']);

    actingAs($user)
        ->getJson("/api/stations/{$station->slug}/status")
        ->assertOk()
        ->assertJsonPath('data.state', 'degraded')
        ->assertJsonPath('data.icecast_connected', false)
        ->assertJsonPath('data.ready', true);
});
