<?php

use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;

beforeEach(function () {
    test()->withoutVite();

    test()->actingAs(Admin::factory()->create(), 'admin');
});

it('lists stations with their owner and plan', function () {
    $plan = Plan::factory()->create(['name' => 'Studio']);
    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user)->create(['name' => 'Midnight FM']);

    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee('Midnight FM')
        ->assertSee($station->slug)
        ->assertSee($user->email)
        ->assertSee('Studio');
});

it('shows which stations are on air', function () {
    Station::factory()->live()->create(['name' => 'Live One']);
    Station::factory()->create(['name' => 'Quiet One']);

    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee('on air');
});

it('counts stations, running stations and users', function () {
    Station::factory()->count(2)->create(['desired_state' => Station::STATE_RUNNING]);
    Station::factory()->create(['desired_state' => Station::STATE_STOPPED]);

    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee('Powered on')
        ->assertSee('Live now');
});

it('shows which stations are featured and how many slots are filled', function () {
    Station::factory()->featured()->running()->create(['name' => 'Picked FM']);
    Station::factory()->create(['name' => 'Unpicked FM']);

    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee('Featured')
        ->assertSee('1 of '.Station::FEATURED_RAIL_SIZE.' slots filled')
        ->assertSee('Unfeature')
        ->assertSee('Feature');
});

it('says when a featured station is powered off, because the rail will not show it', function () {
    Station::factory()->featured()->create([
        'name' => 'Sleeping FM',
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee('1 powered off');
});

it('filters down to featured stations', function () {
    Station::factory()->featured()->running()->create(['name' => 'Picked FM']);
    Station::factory()->create(['name' => 'Unpicked FM']);

    $this->get(route('admin.stations.index', ['featured' => '1']))
        ->assertOk()
        ->assertSee('Picked FM')
        ->assertDontSee('Unpicked FM');
});

it('searches by station name and owner email', function () {
    $owner = User::factory()->create(['email' => 'dj@example.test']);
    Station::factory()->for($owner)->create(['name' => 'Needle FM']);
    Station::factory()->create(['name' => 'Haystack FM']);

    $this->get(route('admin.stations.index', ['search' => 'Needle']))
        ->assertOk()
        ->assertSee('Needle FM')
        ->assertDontSee('Haystack FM');

    $this->get(route('admin.stations.index', ['search' => 'dj@example.test']))
        ->assertOk()
        ->assertSee('Needle FM')
        ->assertDontSee('Haystack FM');
});
