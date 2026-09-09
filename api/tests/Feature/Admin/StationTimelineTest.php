<?php

use App\Models\Admin;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;

/**
 * The admin-facing timeline: the page somebody opens when a station was on air
 * last night and is not now.
 */
beforeEach(function () {
    test()->withoutVite();
    config()->set('services.frontend_url', 'https://gocast.test');

    $this->admin = Admin::factory()->create();
    test()->actingAs($this->admin, 'admin');

    $this->station = Station::factory()->for(User::factory(), 'user')->create([
        'name' => 'Night Shift',
        'slug' => 'night-shift',
    ]);
});

it('is closed to anyone who is not an admin', function () {
    test()->post(route('admin.logout'));

    $this->get(route('admin.stations.show', $this->station))
        ->assertRedirect(route('admin.login'));
});

it('shows a station timeline newest first', function () {
    StationEvent::factory()->for($this->station)
        ->type(StationEvent::TYPE_BOOT)
        ->create(['created_at' => now()->subHours(2)]);

    StationEvent::factory()->for($this->station)
        ->type(StationEvent::TYPE_ICECAST_ERROR)
        ->create(['created_at' => now()->subHour()]);

    $this->get(route('admin.stations.show', $this->station))
        ->assertOk()
        ->assertSee('Night Shift')
        ->assertSeeInOrder(['Icecast refused the source', 'Container came up']);
});

it('never shows one station the events of another', function () {
    $other = Station::factory()->for(User::factory(), 'user')->create();

    StationEvent::factory()->for($other)->type(StationEvent::TYPE_ICECAST_ERROR)->create();

    $response = $this->get(route('admin.stations.show', $this->station))
        ->assertOk()
        ->assertSee('Nothing recorded for this station yet');

    // Asserted on the view data rather than the markup: the filter dropdown
    // lists every event label, so every gloss string is on the page whether or
    // not a matching event exists. The same trap applies to the raw type
    // names, which are the dropdown's option values.
    expect($response->viewData('entries'))->toBeEmpty();
});

it('folds a run of identical events into one row with a count', function () {
    // A flapping station otherwise fills the page with fifty identical lines
    // and hides every other event on either side of them.
    StationEvent::factory()->for($this->station)
        ->type(StationEvent::TYPE_ICECAST_ERROR)
        ->count(8)
        ->create();

    $this->get(route('admin.stations.show', $this->station))
        ->assertOk()
        ->assertSee('&times; 8', false)
        // Once folded, one badge — not eight.
        ->assertSeeText('Icecast refused the source');
});

it('does not fold two uploads just because both are uploads', function () {
    // Properties are part of an event's identity: the interesting half of an
    // upload is which track it was.
    foreach (['First', 'Second'] as $title) {
        StationEvent::factory()->for($this->station)
            ->type(StationEvent::TYPE_TRACK_UPLOADED)
            ->create(['properties' => ['title' => $title]]);
    }

    $this->get(route('admin.stations.show', $this->station))
        ->assertOk()
        ->assertSee('First')
        ->assertSee('Second')
        ->assertDontSee('&times; 2', false);
});

it('filters by event type and by source', function () {
    StationEvent::factory()->for($this->station)->type(StationEvent::TYPE_BOOT)->create();
    StationEvent::factory()->for($this->station)->type(StationEvent::TYPE_STOPPED)->create([
        'source' => StationEvent::SOURCE_OWNER,
    ]);

    $byType = $this->get(route('admin.stations.show', [
        'station' => $this->station,
        'type' => StationEvent::TYPE_STOPPED,
    ]))->assertOk();

    expect(collect($byType->viewData('entries'))->pluck('event.type')->all())
        ->toBe([StationEvent::TYPE_STOPPED]);

    $bySource = $this->get(route('admin.stations.show', [
        'station' => $this->station,
        'source' => StationEvent::SOURCE_CONTAINER,
    ]))->assertOk();

    expect(collect($bySource->viewData('entries'))->pluck('event.type')->all())
        ->toBe([StationEvent::TYPE_BOOT]);
});

it('still opens for a station in the trash', function () {
    // "It disappeared" is a support ticket, and the events leading up to the
    // deletion are the answer to it.
    StationEvent::factory()->for($this->station)->type(StationEvent::TYPE_STOPPED)->create();

    $this->station->delete();

    $this->get(route('admin.stations.show', $this->station))
        ->assertOk()
        ->assertSee('in trash since')
        ->assertSee('Switched off');
});

it('links each station on the index to its timeline', function () {
    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee(route('admin.stations.show', $this->station), false);
});
