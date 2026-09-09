<?php

use App\Models\Admin;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;
use App\Services\StationLifecycleService;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;

/**
 * The per-station timeline: what gets written to it, by whom, and what happens
 * when the write fails.
 *
 * The load-bearing claim under test is the NEGATIVE one — that recording an
 * event can never break the thing it observes. Everything else here is a
 * timeline being slightly less complete than it could be, which is a cost the
 * design accepts on purpose.
 */
function postStationEvent(array $payload): TestResponse
{
    return test()->postJson('/api/internal/station-event', $payload, [
        'X-Internal-Key' => config('services.internal_api_key'),
    ]);
}

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);

    $this->user = User::factory()->create();
    $this->station = Station::factory()->for($this->user, 'user')->create([
        'slug' => 'timeline-station',
        'desired_state' => Station::STATE_RUNNING,
    ]);
});

it('records every event a container reports', function () {
    foreach (StationEvent::CONTAINER_TYPES as $type) {
        postStationEvent(['slug' => 'timeline-station', 'event' => $type])->assertOk();
    }

    expect(StationEvent::pluck('type')->all())->toBe(StationEvent::CONTAINER_TYPES)
        ->and(StationEvent::pluck('source')->unique()->all())->toBe([StationEvent::SOURCE_CONTAINER]);
});

it('leaves no trace of an event the container is not allowed to report', function () {
    // The endpoint is reachable by every station container, so an unknown
    // event name must not become a row that a reader takes at face value.
    postStationEvent(['slug' => 'timeline-station', 'event' => 'rm -rf'])
        ->assertStatus(422);

    expect(StationEvent::count())->toBe(0);
});

it('attributes a container event to nobody', function () {
    // A container is not a person. A causer here would be whoever happened to
    // be signed in when the webhook landed, which is worse than no answer.
    postStationEvent(['slug' => 'timeline-station', 'event' => StationEvent::TYPE_BOOT])->assertOk();

    $event = StationEvent::sole();

    expect($event->causer_type)->toBeNull()
        ->and($event->causer_id)->toBeNull()
        ->and($event->causerLabel())->toBeNull();
});

it('records the owner behind a power-button press', function () {
    $this->actingAs($this->user);

    // The fixture station is already on air and the free plan allows one at a
    // time, so switch it off rather than starting a second one — the plan
    // limit is not what this test is about.
    $this->station->forceFill(['desired_state' => Station::STATE_STOPPED])->save();

    app(StationLifecycleService::class)->start($this->station);

    $event = StationEvent::where('type', StationEvent::TYPE_STARTED)->sole();

    expect($event->source)->toBe(StationEvent::SOURCE_OWNER)
        ->and($event->causer_id)->toBe((string) $this->user->id)
        ->and($event->properties['reason'])->toBe('owner')
        ->and($event->causerLabel())->toBe($this->user->email);
});

it('tells an auto-stop apart from an owner switching a station off', function () {
    // Both leave an identical `stopped` station behind, and "why is my station
    // off?" is the whole reason this table exists.
    $lifecycle = app(StationLifecycleService::class);

    $lifecycle->stop($this->station, reason: 'silent');

    $event = StationEvent::where('type', StationEvent::TYPE_STOPPED)->sole();

    expect($event->properties['reason'])->toBe('silent')
        // Nobody was signed in: the sweep runs in a queued job.
        ->and($event->source)->toBe(StationEvent::SOURCE_SYSTEM)
        ->and($event->causer_id)->toBeNull();
});

it('attributes an admin action to the admin guard', function () {
    $admin = Admin::factory()->create();
    $this->actingAs($admin, 'admin');

    StationEvent::record($this->station, StationEvent::TYPE_STOPPED);

    $event = StationEvent::sole();

    expect($event->source)->toBe(StationEvent::SOURCE_ADMIN)
        ->and($event->causer_id)->toBe((string) $admin->id);
});

it('never lets a failed event write break the thing it is observing', function () {
    // The contract that makes this table safe to call from the upload
    // pipeline and the power button. A broken log costs a gap, never a
    // failed request.
    DB::statement('DROP TABLE station_events');

    expect(StationEvent::record($this->station, StationEvent::TYPE_BOOT))->toBeNull();

    postStationEvent(['slug' => 'timeline-station', 'event' => StationEvent::TYPE_BOOT])
        ->assertOk()
        ->assertJson(['ok' => true]);
});

it('caps how much one flapping container can write in a minute', function () {
    config(['station_events.max_per_minute' => 3]);

    foreach (range(1, 10) as $ignored) {
        StationEvent::record($this->station, StationEvent::TYPE_BOOT, StationEvent::SOURCE_CONTAINER);
    }

    expect(StationEvent::count())->toBe(3);
});

it('does not let a noisy container silence the owner in the same minute', function () {
    // The cap exists to bound disk growth from unattended floods. An owner
    // pressing stop is the single most valuable row on the page and must not
    // be dropped because their container was having a bad night.
    config(['station_events.max_per_minute' => 2]);

    foreach (range(1, 10) as $ignored) {
        StationEvent::record($this->station, StationEvent::TYPE_BOOT, StationEvent::SOURCE_CONTAINER);
    }

    StationEvent::record($this->station, StationEvent::TYPE_STOPPED, StationEvent::SOURCE_OWNER);

    expect(StationEvent::where('source', StationEvent::SOURCE_CONTAINER)->count())->toBe(2)
        ->and(StationEvent::where('type', StationEvent::TYPE_STOPPED)->exists())->toBeTrue();
});

it('goes with the station when the station is erased for good', function () {
    StationEvent::record($this->station, StationEvent::TYPE_BOOT, StationEvent::SOURCE_CONTAINER);

    // Soft delete keeps the history — a station in the trash is exactly the
    // one whose timeline somebody needs.
    $this->station->delete();
    expect(StationEvent::count())->toBe(1);

    $this->station->forceDelete();
    expect(StationEvent::count())->toBe(0);
});
