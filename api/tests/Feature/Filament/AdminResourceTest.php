<?php

use App\Filament\Resources\Admins\Pages\ListAdmins;
use App\Models\Admin;
use Livewire\Livewire;

it('lists admins for an authenticated admin', function () {
    $admin = Admin::factory()->create();
    $other = Admin::factory()->create();

    $this->actingAs($admin, 'admin');

    Livewire::test(ListAdmins::class)
        ->assertCanSeeTableRecords([$admin, $other]);
});

it('does not offer a create action', function () {
    $this->actingAs(Admin::factory()->create(), 'admin');

    Livewire::test(ListAdmins::class)
        ->assertActionDoesNotExist('create');
});
