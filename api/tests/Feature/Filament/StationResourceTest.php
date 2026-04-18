<?php

use App\Filament\Resources\Stations\Pages\EditStation;
use App\Filament\Resources\Stations\Pages\ListStations;
use App\Models\Admin;
use App\Models\Station;
use App\Models\User;
use Livewire\Livewire;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('toggles the featured flag and logs activity', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio One',
        'slug' => 'radio-one',
        'featured' => false,
    ]);

    Livewire::test(ListStations::class)
        ->callTableAction('toggle_featured', $station);

    expect($station->fresh()->featured)->toBeTrue();

    $activity = Activity::where('subject_id', $station->id)->where('event', 'featured')->first();
    expect($activity)->not->toBeNull();
});

it('soft-deletes a station when the slug is typed correctly', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio Two',
        'slug' => 'radio-two',
    ]);

    Livewire::test(ListStations::class)
        ->callTableAction('delete', $station, ['confirmation' => 'radio-two']);

    expect(Station::find($station->id))->toBeNull();
    expect(Station::withTrashed()->find($station->id))->not->toBeNull();
});

it('blocks soft-delete when the slug confirmation is wrong', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio Three',
        'slug' => 'radio-three',
    ]);

    Livewire::test(ListStations::class)
        ->callTableAction('delete', $station, ['confirmation' => 'wrong'])
        ->assertHasActionErrors();

    expect(Station::find($station->id))->not->toBeNull();
});

it('does not write is_live in the edit form', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio Four',
        'slug' => 'radio-four',
        'is_live' => true,
    ]);

    Livewire::test(EditStation::class, ['record' => $station->slug])
        ->fillForm(['name' => 'Renamed'])
        ->call('save');

    expect($station->fresh()->is_live)->toBeTrue();
    expect($station->fresh()->name)->toBe('Renamed');
});
