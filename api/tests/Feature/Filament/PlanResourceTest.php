<?php

use App\Filament\Resources\Plans\Pages\ListPlans;
use App\Models\Admin;
use App\Models\Plan;
use Livewire\Livewire;

beforeEach(function () {
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('lists plans', function () {
    $plan = Plan::factory()->create();

    Livewire::test(ListPlans::class)
        ->assertCanSeeTableRecords([$plan]);
});

it('has no create button', function () {
    Livewire::test(ListPlans::class)
        ->assertActionDoesNotExist('create');
});
