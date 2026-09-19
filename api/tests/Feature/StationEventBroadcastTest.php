<?php

use App\Events\StationStateChanged;
use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Illuminate\Testing\TestResponse;

/**
 * Which container events reach an open dashboard over the socket, and which
 * deliberately do not.
 *
 * The broadcast is a fast path on top of a fast path: losing one costs the
 * dashboard a few seconds of freshness, because the reconcile poll in
 * useStationStatus still runs underneath. So these tests are about the
 * SELECTION — a broadcast nobody can see is cost without benefit, and on
 * Ably's free tier concurrent connections are the scarce resource.
 */
function postBroadcastEvent(array $payload): TestResponse
{
    return test()->postJson('/api/internal/station-event', $payload, [
        'X-Internal-Key' => config('services.internal_api_key'),
    ]);
}

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);

    $this->owner = User::factory()->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create([
        'slug' => 'broadcasting-station',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    Event::fake([StationStateChanged::class]);
});

it('broadcasts the events that change what the dashboard draws', function (string $event) {
    postBroadcastEvent(['slug' => 'broadcasting-station', 'event' => $event])->assertOk();

    Event::assertDispatched(
        StationStateChanged::class,
        fn (StationStateChanged $e) => $e->slug === 'broadcasting-station' && $e->event === $event,
    );
})->with([
    'shutdown',
    'icecast_connected',
    'icecast_disconnected',
    // Easy to leave out, and the one that would matter: on_error sets
    // `ice_up := false` in the template exactly as on_disconnect does, so it
    // produces the same `degraded` state. Without it, a station that loses its
    // mount to an error rather than a clean disconnect is the single case that
    // stays stale on screen.
    'icecast_error',
    'live_connected',
    'live_disconnected',
]);

it('stays off the wire for events nothing renders', function (string $event) {
    postBroadcastEvent(['slug' => 'broadcasting-station', 'event' => $event])->assertOk();

    Event::assertNotDispatched(StationStateChanged::class);
})->with([
    // Fires from on_start, BEFORE the audio graph is ready — the station reads
    // as `starting` both before and after it, so there is nothing to redraw.
    // icecast_connected is what actually ends the boot.
    'boot',
    // Not surfaced anywhere in the UI. On the wire they would be pure noise.
    'live_silent',
    'live_audio',
]);

it('broadcasts nothing for an event it does not recognise', function () {
    postBroadcastEvent(['slug' => 'broadcasting-station', 'event' => 'not_a_real_event'])
        ->assertStatus(422);

    Event::assertNotDispatched(StationStateChanged::class);
});

it('broadcasts nothing for a station that does not exist', function () {
    postBroadcastEvent(['slug' => 'no-such-station', 'event' => 'icecast_connected'])
        ->assertNotFound();

    Event::assertNotDispatched(StationStateChanged::class);
});

it('carries a signal, not a status', function () {
    postBroadcastEvent(['slug' => 'broadcasting-station', 'event' => 'live_connected'])->assertOk();

    Event::assertDispatched(StationStateChanged::class, function (StationStateChanged $e) {
        // Deliberately narrow. The client refetches on receipt, so putting
        // state on the wire would mean a second copy of
        // StationStatusService::state() written in TypeScript. Anything added
        // here is a rule somebody has to keep in step by hand.
        expect(array_keys($e->broadcastWith()))->toEqualCanonicalizing(['slug', 'event', 'at']);

        return true;
    });
});

it('routes to the owner, not to the station', function () {
    postBroadcastEvent(['slug' => 'broadcasting-station', 'event' => 'live_connected'])->assertOk();

    Event::assertDispatched(StationStateChanged::class, function (StationStateChanged $e) {
        // One channel per user carries every station they own, which is what
        // keeps an owner with three stations inside Ably's 200-channel ceiling
        // at one channel rather than three.
        expect($e->broadcastOn()->name)->toBe('private-user.'.$this->owner->id);

        return true;
    });
});

it('queues ahead of uploads and track analysis', function () {
    postBroadcastEvent(['slug' => 'broadcasting-station', 'event' => 'live_connected'])->assertOk();

    Event::assertDispatched(StationStateChanged::class, function (StationStateChanged $e) {
        // One worker in production, and `default` carries jobs that run for
        // tens of seconds. The worker is started with --queue=realtime,default
        // (infra/native/systemd/gocast-queue.service); rename this and that
        // flag together or broadcasts wait forever.
        expect($e->broadcastQueue())->toBe('realtime');

        return true;
    });
});

it('opens the StreamSession before it announces the broadcast', function () {
    // Ordering that matters, because the client's response to this signal is
    // to refetch. Broadcast first and the dashboard asks for status before the
    // session row exists, gets "nobody is broadcasting", and caches the exact
    // stale answer the push was meant to prevent — only faster.
    Event::assertNothingDispatched();

    postBroadcastEvent([
        'slug' => 'broadcasting-station',
        'event' => 'live_connected',
        'via' => 'external',
        'client' => 'BUTT/1.4.2',
    ])->assertOk();

    Event::assertDispatched(StationStateChanged::class);

    expect($this->station->streamSessions()->whereNull('ended_at')->exists())->toBeTrue();
});
