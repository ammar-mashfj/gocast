<?php

use App\Models\ListenerStatHourly;
use App\Models\Station;

/**
 * What search engines are told about station pages: which ones are worth
 * indexing (the sitemap and the player page's noindex both read this), and
 * the rate-limit exemption the Next server needs to render them for a crawler.
 */
function recordListenerHour(Station $station): void
{
    ListenerStatHourly::create([
        'station_id' => $station->id,
        'hour' => now()->subWeek()->startOfHour(),
        'peak_listeners' => 3,
        'listener_minutes' => 60,
        'sampled_minutes' => 60,
    ]);
}

it('lists only stations that have ever made a sound in the stations sitemap', function () {
    $running = Station::factory()->running()->create(['slug' => 'running-fm']);

    // Stopped now, but broadcast once — stopping clears started_at, so the
    // history has to come from the session row.
    $broadcastOnce = Station::factory()->create(['slug' => 'past-broadcast']);
    $broadcastOnce->streamSessions()->create([
        'started_at' => now()->subMonth(),
        'ended_at' => now()->subMonth()->addHour(),
        'source_type' => 'browser',
    ]);

    // Stopped, AutoDJ-only history: no session row, but it had listeners.
    $autodjOnce = Station::factory()->create(['slug' => 'past-autodj']);
    recordListenerHour($autodjOnce);

    Station::factory()->create(['slug' => 'never-started']);

    $this->getJson('/api/public/sitemap/stations')
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonPath('data.0.slug', 'past-autodj')
        ->assertJsonPath('data.1.slug', 'past-broadcast')
        ->assertJsonPath('data.2.slug', 'running-fm')
        ->assertJsonStructure(['data' => [['slug', 'updated_at']]]);
});

it('marks a never-started station as not indexable on the public show endpoint', function () {
    Station::factory()->create(['slug' => 'empty']);

    $this->getJson('/api/public/stations/empty')
        ->assertOk()
        ->assertJsonPath('data.indexable', false);
});

it('marks a station with listener history as indexable even when stopped', function () {
    $station = Station::factory()->create(['slug' => 'quiet-now']);
    recordListenerHour($station);

    $this->getJson('/api/public/stations/quiet-now')
        ->assertOk()
        ->assertJsonPath('data.indexable', true);
});

it('marks a running station as indexable', function () {
    Station::factory()->running()->create(['slug' => 'on-air']);

    $this->getJson('/api/public/stations/on-air')
        ->assertOk()
        ->assertJsonPath('data.indexable', true);
});

it('leaves indexable out of list responses, where it would cost queries per row', function () {
    Station::factory()->running()->create();

    $this->getJson('/api/public/stations')
        ->assertOk()
        ->assertJsonMissingPath('data.0.indexable');
});

it('exempts the render key from the public rate limit', function () {
    config(['services.render_api_key' => 'render-secret']);
    Station::factory()->create(['slug' => 'busy']);

    foreach (range(1, 65) as $_) {
        $this->getJson('/api/public/stations/busy', ['X-Render-Key' => 'render-secret'])->assertOk();
    }
});

it('still limits callers with a wrong render key', function () {
    config(['services.render_api_key' => 'render-secret']);
    Station::factory()->create(['slug' => 'busy']);

    foreach (range(1, 60) as $_) {
        $this->getJson('/api/public/stations/busy', ['X-Render-Key' => 'wrong'])->assertOk();
    }

    $this->getJson('/api/public/stations/busy', ['X-Render-Key' => 'wrong'])->assertTooManyRequests();
});

it('grants no exemption when no render key is configured', function () {
    config(['services.render_api_key' => null]);
    Station::factory()->create(['slug' => 'busy']);

    foreach (range(1, 60) as $_) {
        $this->getJson('/api/public/stations/busy', ['X-Render-Key' => ''])->assertOk();
    }

    $this->getJson('/api/public/stations/busy', ['X-Render-Key' => ''])->assertTooManyRequests();
});
