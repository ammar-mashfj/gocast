<?php

use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;

/**
 * GET /stations/{slug}/sessions, as the Your shows page reads it: past shows
 * a page at a time, with a summary that covers all of them.
 */
beforeEach(function () {
    $this->station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);
});

function pastShow(Station $station, int $daysAgo, int $minutes, bool $open = false): StreamSession
{
    $start = now()->subDays($daysAgo)->startOfMinute();

    return StreamSession::create([
        'station_id' => $station->id,
        'started_at' => $start,
        'ended_at' => $open ? null : $start->copy()->addMinutes($minutes),
        'peak_listeners' => 1,
    ]);
}

it('summarises every finished show, not just the page', function () {
    foreach (range(1, 25) as $day) {
        pastShow($this->station, $day, 60);
    }
    pastShow($this->station, 0, 0, open: true);

    $this->actingAs($this->station->user)
        ->getJson('/api/stations/jazz/sessions')
        ->assertOk()
        ->assertJsonCount(20, 'data')
        ->assertJsonPath('summary.shows', 25)
        ->assertJsonPath('summary.live_seconds', 25 * 3600);
});

it('leaves the show on air out when asked for finished shows only', function () {
    pastShow($this->station, 0, 0, open: true);
    pastShow($this->station, 1, 30);

    $this->actingAs($this->station->user)
        ->getJson('/api/stations/jazz/sessions?finished=1')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('total', 1);
});

it('pages through past shows', function () {
    foreach (range(1, 22) as $day) {
        pastShow($this->station, $day, 10);
    }

    $this->actingAs($this->station->user)
        ->getJson('/api/stations/jazz/sessions?finished=1&page=2')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('last_page', 2);
});

it('is the owner\'s only', function () {
    $this->actingAs(User::factory()->create())
        ->getJson('/api/stations/jazz/sessions')
        ->assertForbidden();
});
