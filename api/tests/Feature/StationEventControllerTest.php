<?php

use App\Http\Controllers\StationEventController;
use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;

/**
 * Lifecycle events pushed by a station's own container. These are a fast path,
 * never a source of truth — a container that dies at boot reports nothing at
 * all — so the tests here care mostly that the endpoint is closed to anything
 * that isn't a station container, and that a lost event costs nothing.
 */
function postEvent(array $payload, array $headers = []): TestResponse
{
    return test()->postJson('/api/internal/station-event', $payload, array_merge([
        'X-Internal-Key' => config('services.internal_api_key'),
    ], $headers));
}

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);

    $this->station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'reporting-station',
        'desired_state' => Station::STATE_RUNNING,
    ]);
});

it('rejects an event without the internal key', function () {
    // The endpoint is reachable by anything that can route to the api; the
    // shared key is the only thing separating a station container from the
    // internet.
    postEvent(['slug' => 'reporting-station', 'event' => 'boot'], ['X-Internal-Key' => 'wrong'])
        ->assertUnauthorized();
});

it('records that a station reached its listeners', function () {
    expect($this->station->last_ready_at)->toBeNull();

    postEvent(['slug' => 'reporting-station', 'event' => 'icecast_connected'])
        ->assertOk()
        ->assertJson(['ok' => true]);

    // `started_at` records intent; this is the first evidence anywhere in the
    // system that a start actually worked.
    expect($this->station->refresh()->last_ready_at)->not->toBeNull();
});

it('does not treat other events as evidence of being audible', function () {
    // "boot" means the process started, which is precisely the claim that was
    // already being over-trusted before any of this.
    postEvent(['slug' => 'reporting-station', 'event' => 'boot'])->assertOk();

    expect($this->station->refresh()->last_ready_at)->toBeNull();
});

it('remembers the most recent event for a station', function () {
    postEvent(['slug' => 'reporting-station', 'event' => 'live_silent'])->assertOk();

    $cached = Cache::get(StationEventController::CACHE_PREFIX.$this->station->id);

    expect($cached['event'])->toBe('live_silent')
        ->and($cached['at'])->not->toBeNull();
});

it('drops events it does not recognise', function () {
    // The payload arrives from a container and must not be able to name its
    // own cache keys.
    postEvent(['slug' => 'reporting-station', 'event' => 'rm -rf'])
        ->assertStatus(422);

    expect(Cache::get(StationEventController::CACHE_PREFIX.$this->station->id))->toBeNull();
});

it('404s for a station that no longer exists', function () {
    postEvent(['slug' => 'deleted-station', 'event' => 'shutdown'])->assertNotFound();
});

it('requires both a slug and an event', function () {
    postEvent(['event' => 'boot'])->assertStatus(422);
    postEvent(['slug' => 'reporting-station'])->assertStatus(422);
});
