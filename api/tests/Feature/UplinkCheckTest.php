<?php

use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The go-live connection check's verdict, kept so the thresholds can be tuned
 * against real lines. Admin monitoring only.
 */
beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create(['slug' => 'jazz']);
});

it('records a blocked check with the line it measured', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/uplink-checks', [
            'outcome' => 'blocked',
            'kbps' => 79,
            'bitrate' => null,
            'net_effective' => '3g',
            'net_downlink' => 0.4,
            'net_rtt' => 550,
            'sneaky' => 'x',
        ])
        ->assertOk();

    $event = StationEvent::query()->where('station_id', $this->station->id)->sole();

    expect($event->type)->toBe(StationEvent::TYPE_UPLINK_CHECK)
        ->and($event->source)->toBe(StationEvent::SOURCE_OWNER)
        ->and($event->properties)->toMatchArray(['outcome' => 'blocked', 'kbps' => 79, 'net_effective' => '3g', 'net_rtt' => 550])
        ->and($event->properties)->not->toHaveKey('bitrate')
        ->and($event->properties)->not->toHaveKey('sneaky');
});

it('rejects an unknown outcome', function () {
    actingAs($this->owner)
        ->postJson('/api/stations/jazz/uplink-checks', ['outcome' => 'great'])
        ->assertUnprocessable();
});

it('refuses someone who does not own the station', function () {
    actingAs(User::factory()->create())
        ->postJson('/api/stations/jazz/uplink-checks', ['outcome' => 'ok', 'kbps' => 5000, 'bitrate' => 128])
        ->assertForbidden();

    expect(StationEvent::query()->count())->toBe(0);
});
