<?php

use App\Models\ListenerStatHourly;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->station = Station::factory()->for($this->user, 'user')->create(['slug' => 'jazz']);
});

/** One hour of audience for the station under test. */
function hourlyPeak(Station $station, int $peak, string $hour = '2026-08-30 14:00:00'): ListenerStatHourly
{
    return ListenerStatHourly::create([
        'station_id' => $station->id,
        'hour' => $hour,
        'peak_listeners' => $peak,
        'listener_minutes' => $peak * 60,
        'sampled_minutes' => 60,
    ]);
}

/**
 * THE REGRESSION. `stats.peak_listeners` used to read
 * `max(stream_sessions.peak_listeners)`, so a station that had never done a
 * live broadcast reported 0 no matter how large its AutoDJ audience got.
 */
it('reports a peak for a station that has only ever run AutoDJ', function () {
    hourlyPeak($this->station, 37);

    actingAs($this->user)
        ->getJson("/api/stations/{$this->station->slug}")
        ->assertOk()
        ->assertJsonPath('data.stats.peak_listeners', 37)
        // No broadcast has ever happened, which is the whole point.
        ->assertJsonPath('data.stats.sessions', 0);
});

it('counts the broadcast in progress, not just the finished ones', function () {
    // Best hour ever, happening right now.
    hourlyPeak($this->station, 120);

    StreamSession::create([
        'station_id' => $this->station->id,
        'started_at' => now()->subMinutes(10),
        'ended_at' => null,
        'peak_listeners' => 120,
    ]);

    actingAs($this->user)
        ->getJson("/api/stations/{$this->station->slug}")
        ->assertOk()
        ->assertJsonPath('data.stats.peak_listeners', 120);
});

it('takes the highest hour across the station history', function () {
    hourlyPeak($this->station, 8, '2026-08-28 10:00:00');
    hourlyPeak($this->station, 51, '2026-08-29 21:00:00');
    hourlyPeak($this->station, 12, '2026-08-30 09:00:00');

    actingAs($this->user)
        ->getJson("/api/stations/{$this->station->slug}")
        ->assertOk()
        ->assertJsonPath('data.stats.peak_listeners', 51);
});

it('does not borrow another station audience', function () {
    $other = Station::factory()->for($this->user, 'user')->create(['slug' => 'rock']);
    hourlyPeak($other, 99);
    hourlyPeak($this->station, 4);

    actingAs($this->user)
        ->getJson("/api/stations/{$this->station->slug}")
        ->assertOk()
        ->assertJsonPath('data.stats.peak_listeners', 4);
});

it('reports zero for a station nobody has ever listened to', function () {
    actingAs($this->user)
        ->getJson("/api/stations/{$this->station->slug}")
        ->assertOk()
        ->assertJsonPath('data.stats.peak_listeners', 0);
});

it('still reports airtime from closed broadcasts', function () {
    StreamSession::create([
        'station_id' => $this->station->id,
        'started_at' => now()->subHours(2),
        'ended_at' => now()->subHour(),
    ]);

    actingAs($this->user)
        ->getJson("/api/stations/{$this->station->slug}")
        ->assertOk()
        ->assertJsonPath('data.stats.sessions', 1)
        ->assertJsonPath('data.stats.total_airtime_seconds', 3600);
});
