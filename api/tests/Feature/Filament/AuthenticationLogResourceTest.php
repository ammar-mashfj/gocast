<?php

use App\Filament\Resources\AuthenticationLogs\Pages\ListAuthenticationLogs;
use App\Models\Admin;
use Illuminate\Auth\Events\Login;
use Livewire\Livewire;

it('lists login events', function () {
    $admin = Admin::factory()->create();
    $this->actingAs($admin, 'admin');

    event(new Login('admin', $admin, remember: false));

    Livewire::test(ListAuthenticationLogs::class)
        ->assertSee($admin->email);
});
