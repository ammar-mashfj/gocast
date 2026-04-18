<?php

use App\Models\Station;
use App\Models\User;

it('soft-deletes a station', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user)->create([
        'name' => 'Test Station',
        'slug' => 'test-station',
    ]);

    $station->delete();

    expect(Station::find($station->id))->toBeNull();
    expect(Station::withTrashed()->find($station->id))->not->toBeNull();
});

it('cascades soft-delete from user to stations', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user)->create([
        'name' => 'Cascade Station',
        'slug' => 'cascade-station',
    ]);

    $user->stations()->delete();

    expect(Station::find($station->id))->toBeNull();
    expect(Station::withTrashed()->find($station->id)->deleted_at)->not->toBeNull();
});
