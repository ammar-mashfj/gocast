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
