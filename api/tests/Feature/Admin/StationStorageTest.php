<?php

use App\Models\Admin;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    test()->withoutVite();

    test()->admin = Admin::factory()->create();
    test()->actingAs(test()->admin, 'admin');

    config(['liquidsoap.station_storage_bytes' => 3 * 1024 ** 3]);
});

it('sets a station storage cap in GB', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['name' => 'Big FM']);

    $this->post(route('admin.stations.storage', $station), ['storage_gb' => '10'])
        ->assertRedirect()
        ->assertSessionHas('status', 'Big FM can now store 10 GB.');

    expect($station->refresh()->storage_cap_bytes)->toBe(10 * 1024 ** 3);
});

it('accepts a fractional GB value', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $this->post(route('admin.stations.storage', $station), ['storage_gb' => '4.5']);

    expect($station->refresh()->storage_cap_bytes)->toBe((int) (4.5 * 1024 ** 3));
});

it('resets to the install default when left blank', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['storage_cap_bytes' => 10 * 1024 ** 3]);

    $this->post(route('admin.stations.storage', $station), ['storage_gb' => ''])
        ->assertRedirect()
        ->assertSessionHas('status', fn (string $status) => str_contains($status, '3 GB'));

    expect($station->refresh()->storage_cap_bytes)->toBeNull();
});

it('rejects a value that is not a positive number', function (mixed $value) {
    $station = Station::factory()->for(User::factory(), 'user')->create(['storage_cap_bytes' => 10 * 1024 ** 3]);

    $this->post(route('admin.stations.storage', $station), ['storage_gb' => $value])
        ->assertSessionHasErrors('storage_gb');

    expect($station->refresh()->storage_cap_bytes)->toBe(10 * 1024 ** 3);
})->with(['0', '-5', 'lots', '20000', '4.25']);

it('records which admin changed the cap', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $this->post(route('admin.stations.storage', $station), ['storage_gb' => '10']);

    $activity = Activity::query()
        ->where('subject_id', $station->id)
        ->where('description', 'set station storage cap')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull()
        ->and($activity->causer_id)->toEqual($this->admin->id);
});

it('shows usage against the cap on the station page', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['storage_cap_bytes' => 10 * 1024 ** 3]);

    $this->get(route('admin.stations.show', $station))
        ->assertOk()
        ->assertSee('of 10 GB')
        ->assertSee('set by an admin')
        ->assertSee('value="10"', false);
});

it('shows a small library in MB rather than 0 GB', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();
    Track::factory()->for($station)->create(['file_size_bytes' => 40 * 1024 ** 2]);

    $this->get(route('admin.stations.show', $station))
        ->assertOk()
        ->assertSee('40 MB')
        ->assertSee('of 3 GB')
        ->assertDontSee('0 GB of');
});

it('is not reachable without an admin session', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    auth('admin')->logout();

    $this->post(route('admin.stations.storage', $station), ['storage_gb' => '10'])
        ->assertRedirect(route('admin.login'));

    expect($station->refresh()->storage_cap_bytes)->toBeNull();
});
