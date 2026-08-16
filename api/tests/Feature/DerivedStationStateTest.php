<?php

use App\Models\Station;
use App\Models\User;
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
    $station = onAirStation(['slug' => 'booting-fm']);
    Http::fake(['*/status' => Http::response('', 500)]);

    getJson('/api/public/stations/booting-fm/listeners')
        ->assertOk()
        ->assertJsonPath('data.state', 'starting')
        ->assertJsonPath('data.is_on_air', false);
});
