<?php

use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The Free idle check's outcome, kept for the admin station timeline. The
 * check itself runs in the browser; this only records what it did.
 */
beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create(['slug' => 'jazz']);
});

it('records a show the idle check ended', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/idle-checks', [
            'outcome' => 'ended',
            'on_air_seconds' => 4210,
            'hidden' => true,
            'sneaky' => 'x',
        ])
        ->assertOk();

    $event = StationEvent::query()->where('station_id', $this->station->id)->sole();

    expect($event->type)->toBe(StationEvent::TYPE_IDLE_CHECK)
        ->and($event->source)->toBe(StationEvent::SOURCE_OWNER)
        ->and($event->properties)->toMatchArray(['outcome' => 'ended', 'on_air_seconds' => 4210, 'hidden' => true])
        ->and($event->properties)->not->toHaveKey('sneaky');
});

it('records a host who answered', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/idle-checks', ['outcome' => 'kept'])
        ->assertOk();

    expect(StationEvent::query()->sole()->properties)->toBe(['outcome' => 'kept']);
});

it('records a host who ended the show from the question', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/idle-checks', ['outcome' => 'ended_by_host'])
        ->assertOk();

    expect(StationEvent::query()->sole()->properties)->toBe(['outcome' => 'ended_by_host']);
});

it('rejects an unknown outcome', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/idle-checks', ['outcome' => 'snoozed'])
        ->assertUnprocessable();
});

it('refuses someone who does not own the station', function () {
    actingAs(User::factory()->create())
        ->postJson('/api/stations/jazz/idle-checks', ['outcome' => 'ended'])
        ->assertForbidden();

    expect(StationEvent::query()->count())->toBe(0);
});
