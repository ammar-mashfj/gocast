<?php

use App\Filament\Resources\StreamSessions\Pages\ListStreamSessions;
use App\Models\Admin;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use Livewire\Livewire;

it('lists stream sessions', function () {
    $this->actingAs(Admin::factory()->create(), 'admin');

    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Test',
        'slug' => 'test-station-stream',
    ]);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subHour(),
        'ended_at' => now(),
        'peak_listeners' => 5,
        'total_listener_minutes' => 30,
        'source_type' => 'browser',
    ]);

    Livewire::test(ListStreamSessions::class)
        ->assertCanSeeTableRecords([$session]);
});
