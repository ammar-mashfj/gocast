<?php

use App\Filament\Resources\ActivityLogs\Pages\ListActivityLogs;
use App\Models\Admin;
use App\Models\User;
use Livewire\Livewire;

it('lists activity rows', function () {
    $admin = Admin::factory()->create();
    $this->actingAs($admin, 'admin');

    activity()
        ->causedBy($admin)
        ->performedOn(User::factory()->create())
        ->event('test_event')
        ->log('did a thing');

    Livewire::test(ListActivityLogs::class)
        ->assertSee('test_event');
});
