<?php

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;

/**
 * Telling an encoder broadcast from a studio broadcast.
 *
 * An external encoder makes no API call of its own — its entire conversation
 * with us is harbor's `live_connected` event — so these headers are the only
 * evidence that exists. Get it wrong and every BUTT session is filed under
 * "Studio" on the station overview, which is exactly where someone checks
 * whether their encoder worked.
 */
function liveConnected(array $payload): TestResponse
{
    return test()->postJson('/api/internal/station-event', array_merge([
        'slug' => 'jazz',
        'event' => 'live_connected',
    ], $payload), ['X-Internal-Key' => config('services.internal_api_key')]);
}

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);

    $this->station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'jazz',
        'desired_state' => Station::STATE_RUNNING,
    ]);
});

it('files an encoder connection as external', function () {
    liveConnected(['via' => 'external', 'client' => 'libshout/2.4.6'])->assertOk();

    $session = $this->station->streamSessions()->sole();

    expect($session->source_type)->toBe('external')
        ->and($session->client)->toBe('libshout/2.4.6');
});

it('files a studio connection as browser', function () {
    liveConnected(['via' => 'browser', 'client' => 'Mozilla/5.0'])->assertOk();

    expect($this->station->streamSessions()->sole()->source_type)->toBe('browser');
});

it('keeps behaving as before for a container that reports no headers', function () {
    // Every container running at the moment the template changed. They keep
    // the old script until stations:relaunch recreates them, and until then
    // they must not start producing rows nothing can read.
    liveConnected([])->assertOk();

    $session = $this->station->streamSessions()->sole();

    expect($session->source_type)->toBe('browser')
        ->and($session->client)->toBeNull();
});

it('refuses a via it does not recognise rather than storing it', function () {
    // source_type is an enum column; an unvalidated value here is a database
    // error on a fast-path endpoint that is supposed to never be load-bearing.
    liveConnected(['via' => 'rtmp'])->assertStatus(422);

    expect($this->station->streamSessions()->count())->toBe(0);
});

it('does not relabel a session the studio already opened', function () {
    // The studio opens its own row through StreamSessionController before it
    // touches harbor, and that row knows which DEVICE is broadcasting — which
    // this event cannot see. Reusing it is what keeps airtime from being
    // double counted.
    $existing = $this->station->streamSessions()->create([
        'started_at' => now()->subMinute(),
        'source_type' => 'browser',
    ]);

    liveConnected(['via' => 'browser', 'client' => 'Mozilla/5.0'])->assertOk();

    expect($this->station->streamSessions()->count())->toBe(1)
        ->and($existing->fresh()->ended_at)->toBeNull();
});

it('carries the client onto the admin timeline', function () {
    liveConnected(['via' => 'external', 'client' => 'Mixxx 2.5.0'])->assertOk();

    $event = StationEvent::where('station_id', $this->station->id)
        ->where('type', StationEvent::TYPE_LIVE_CONNECTED)
        ->sole();

    expect($event->properties)->toBe(['via' => 'external', 'client' => 'Mixxx 2.5.0']);
});

it('records nothing extra for events that carry no headers', function () {
    test()->postJson('/api/internal/station-event', [
        'slug' => 'jazz',
        'event' => 'boot',
    ], ['X-Internal-Key' => config('services.internal_api_key')])->assertOk();

    $event = StationEvent::where('station_id', $this->station->id)
        ->where('type', StationEvent::TYPE_BOOT)
        ->sole();

    expect($event->properties)->toBeNull();
});

it('tells the dashboard who is on air, and with what', function () {
    // The power badge reads this to say "Live from Mixxx 2.5.0" instead of
    // "Live from another source" — the phrasing it was stuck with while every
    // session was opened with a hardcoded source_type.
    liveConnected(['via' => 'external', 'client' => 'Mixxx 2.5.0'])->assertOk();

    $this->actingAs($this->station->user)
        ->getJson('/api/stations/jazz/status')
        ->assertOk()
        ->assertJsonPath('data.live_source.type', 'external')
        ->assertJsonPath('data.live_source.client', 'Mixxx 2.5.0');
});

it('reports no live source once the broadcaster leaves', function () {
    liveConnected(['via' => 'external', 'client' => 'Mixxx 2.5.0'])->assertOk();

    test()->postJson('/api/internal/station-event', [
        'slug' => 'jazz',
        'event' => 'live_disconnected',
    ], ['X-Internal-Key' => config('services.internal_api_key')])->assertOk();

    $this->actingAs($this->station->user)
        ->getJson('/api/stations/jazz/status')
        ->assertOk()
        ->assertJsonPath('data.live_source', null);
});

it('refuses to let the studio take over a station an encoder is holding', function () {
    // Harbor allows ONE source per mount, so the studio cannot win this fight
    // — it can only lose it at the socket, after the API has already closed
    // the encoder's session row and opened a phantom browser one. The refusal
    // has to happen here, before either.
    liveConnected(['via' => 'external', 'client' => 'Mixxx 2.5.0'])->assertOk();
    $encoderSession = $this->station->streamSessions()->sole();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/sessions', ['device_id' => 'some-browser'])
        ->assertStatus(409)
        ->assertJsonPath('code', 'station_already_live')
        // Naming the software is the difference between an instruction and a
        // riddle: there is no control in this app that can end that broadcast.
        ->assertJsonPath('message', 'This station is already live from Mixxx 2.5.0. Disconnect it there before broadcasting from the studio.');

    expect($this->station->streamSessions()->count())->toBe(1)
        ->and($encoderSession->fresh()->ended_at)->toBeNull();
});

it('lets the studio start once the encoder has gone', function () {
    liveConnected(['via' => 'external', 'client' => 'Mixxx 2.5.0'])->assertOk();

    test()->postJson('/api/internal/station-event', [
        'slug' => 'jazz',
        'event' => 'live_disconnected',
    ], ['X-Internal-Key' => config('services.internal_api_key')])->assertOk();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/sessions', ['device_id' => 'some-browser'])
        ->assertStatus(201);
});

it('tells the owner where to end an encoder broadcast when they try to stop the station', function () {
    // The stop guard is right to refuse — stopping mid-broadcast drops every
    // listener — but "end the broadcast" is an instruction with nowhere to
    // carry it out when the source is BUTT on someone's laptop.
    liveConnected(['via' => 'external', 'client' => 'BUTT 1.4.2'])->assertOk();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/stop')
        ->assertStatus(409)
        ->assertJsonPath('code', 'station_is_live_external')
        ->assertJsonPath('message', 'This station is on air. Disconnect BUTT 1.4.2 to take it off air, or cut the broadcast off from here.');
});

it('cuts off an encoder broadcast when the owner confirms', function () {
    // The way out of a leaked stream key, and of a DJ's laptop that died with
    // the session still open: the refusal above is not the end of the road.
    liveConnected(['via' => 'external', 'client' => 'BUTT 1.4.2'])->assertOk();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/stop', ['force' => true])
        ->assertOk();

    expect($this->station->fresh()->desired_state)->toBe('stopped');

    // AND THE SESSION IS CLOSED. Asserting only on desired_state missed the
    // half of this that matters: the container is torn down without ever
    // sending `live_disconnected`, and ReconcileStations only sweeps stations
    // that are still running — so a row left open here is open forever. The
    // owner's next Take off air would refuse all over again, for a broadcast
    // that ended days ago.
    expect($this->station->streamSessions()->whereNull('ended_at')->count())->toBe(0)
        ->and($this->station->fresh()->isLive())->toBeFalse();
});

it('lets the owner stop the station again after cutting an encoder off', function () {
    // The reason the assertion above is not just bookkeeping. A session left
    // open survives the stop, so the station still reads as live, and the next
    // stop is refused with the cut-off dialog for a broadcast that is gone.
    liveConnected(['via' => 'external', 'client' => 'BUTT 1.4.2'])->assertOk();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/stop', ['force' => true])
        ->assertOk();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/start')
        ->assertStatus(202);

    // No broadcaster has connected to the restarted station, so an ordinary
    // stop — no force — has to be allowed.
    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/stop')
        ->assertOk();
});

it('refuses to cut off a STUDIO broadcast even when force is asked for', function () {
    // force is not a general override. The studio has a Stop button that ends
    // the session cleanly, so this path stays closed to it.
    liveConnected(['via' => 'browser'])->assertOk();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/stop', ['force' => true])
        ->assertStatus(409)
        ->assertJsonPath('code', 'station_is_live');

    expect($this->station->fresh()->desired_state)->not->toBe('stopped');
});

it('keeps the old wording when the broadcast is from the studio', function () {
    liveConnected(['via' => 'browser'])->assertOk();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/stop')
        ->assertStatus(409)
        ->assertJsonPath('message', 'This station is on air. End the broadcast before taking it off air.');
});

/**
 * A GHOST is an encoder session row that was never closed: the container was
 * OOM-killed, or partitioned, and `live_disconnected` never arrived. The row
 * claims a broadcast that is not happening, and the station is switched off.
 */
it('lets the studio start on a stopped station holding a ghost encoder session', function () {
    liveConnected(['via' => 'external', 'client' => 'BUTT 1.4.2'])->assertOk();

    // The container died. Nothing closed the row, and the station went off air
    // without it — so no harbor exists that anything could be connected to.
    $this->station->update(['desired_state' => Station::STATE_STOPPED]);

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/sessions', ['device_id' => 'some-browser'])
        ->assertStatus(201);

    expect($this->station->streamSessions()->whereNull('ended_at')->count())->toBe(1);
});

it('still announces a studio broadcast that follows a ghost encoder session', function () {
    // The ghost reads as an open session, so `isLive()` says a broadcast was
    // already in flight and the notification is skipped — leaving the first
    // real broadcast after a crash as the one nobody is told about. The
    // straggler the ghost check cleared must not count as that broadcast.
    liveConnected(['via' => 'external', 'client' => 'BUTT 1.4.2'])->assertOk();
    $this->station->update(['desired_state' => Station::STATE_STOPPED]);

    // Faked AFTER the setup on purpose: `live_connected` dispatches one of
    // these itself, and the question here is only what the studio start does.
    Queue::fake();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/sessions', ['device_id' => 'some-browser'])
        ->assertStatus(201);

    Queue::assertPushed(SendStationLiveNotifications::class);
});

it('does not announce a studio broadcast that takes over from a real one', function () {
    // The other side of the same guard: a genuine open browser session means a
    // broadcast really was in flight, and the takeover is not a new show.
    liveConnected(['via' => 'browser'])->assertOk();

    Queue::fake();

    $this->actingAs($this->station->user)
        ->postJson('/api/stations/jazz/sessions', ['device_id' => 'some-browser'])
        ->assertStatus(201);

    Queue::assertNotPushed(SendStationLiveNotifications::class);
});
