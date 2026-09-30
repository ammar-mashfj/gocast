<?php

use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The studio's report of why its broadcast socket dropped.
 *
 * Admin monitoring only: what matters is that the owner (and only the owner)
 * can write one, that unknown fields never reach the row, and that a report
 * delivered twice is recorded once.
 */
beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create(['slug' => 'jazz']);
});

function dropReport(array $overrides = []): array
{
    return array_merge([
        'id' => 'abc123',
        'outcome' => 'gave_up',
        'dropped_at' => '2026-09-30T15:31:59.000Z',
        'down_ms' => 120000,
        'attempts' => 7,
        'close_code' => 1006,
        'was_clean' => false,
        'visibility' => 'hidden',
        'hidden_for_ms' => 42000,
        'frozen' => true,
        'online' => true,
        'net_type' => 'cellular',
        'net_effective' => '4g',
        'peak_buffered_bytes' => 0,
        'wake_lock' => false,
    ], $overrides);
}

it('records a studio_drop event with the whitelisted fields', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/studio-drops', ['drops' => [dropReport(['sneaky' => 'x'])]])
        ->assertOk()
        ->assertJson(['recorded' => 1]);

    $event = StationEvent::query()->where('station_id', $this->station->id)->sole();

    expect($event->type)->toBe(StationEvent::TYPE_STUDIO_DROP)
        ->and($event->source)->toBe(StationEvent::SOURCE_OWNER)
        ->and($event->causer_id)->toBe((string) $this->owner->id)
        ->and($event->properties['outcome'])->toBe('gave_up')
        ->and($event->properties['frozen'])->toBeTrue()
        ->and($event->properties)->not->toHaveKey('sneaky')
        ->and($event->properties)->not->toHaveKey('id');
});

it('records a resent report only once', function () {
    $payload = ['drops' => [dropReport(), dropReport(['id' => 'def456', 'outcome' => 'reconnected'])]];

    actingAs($this->owner)->postJson('/api/stations/jazz/studio-drops', $payload)->assertJson(['recorded' => 2]);
    actingAs($this->owner)->postJson('/api/stations/jazz/studio-drops', $payload)->assertJson(['recorded' => 0]);

    expect(StationEvent::query()->where('station_id', $this->station->id)->count())->toBe(2);
});

it('refuses someone who does not own the station', function () {
    actingAs(User::factory()->create())
        ->postJson('/api/stations/jazz/studio-drops', ['drops' => [dropReport()]])
        ->assertForbidden();

    expect(StationEvent::query()->count())->toBe(0);
});

it('rejects an unknown outcome', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/studio-drops', ['drops' => [dropReport(['outcome' => 'exploded'])]])
        ->assertUnprocessable();
});
