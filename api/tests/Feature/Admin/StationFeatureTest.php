<?php

use App\Models\Admin;
use App\Models\Station;
use App\Models\User;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    test()->withoutVite();

    test()->admin = Admin::factory()->create();
    test()->actingAs(test()->admin, 'admin');
});

it('features a station', function () {
    $station = Station::factory()->running()->create(['name' => 'Midnight FM']);

    $this->post(route('admin.stations.feature', $station))
        ->assertRedirect();

    $station->refresh();

    expect($station->featured)->toBeTrue()
        ->and($station->featured_at)->not->toBeNull();
});

it('unfeatures a station and clears the timestamp', function () {
    $station = Station::factory()->featured()->running()->create();

    $this->post(route('admin.stations.feature', $station))
        ->assertRedirect();

    $station->refresh();

    expect($station->featured)->toBeFalse()
        // Left set, it would render as "featured since" the next time this
        // station was picked up, dating the decision to the wrong day.
        ->and($station->featured_at)->toBeNull();
});

it('records which admin featured the station', function () {
    $station = Station::factory()->running()->create();

    $this->post(route('admin.stations.feature', $station));

    // LogsActivity resolves its causer off the default guard, which is never
    // the admin guard — without the explicit causedBy() this row exists with
    // nobody attached to it.
    $activity = Activity::query()
        ->where('subject_id', $station->id)
        ->where('description', 'featured station')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull()
        // toEqual, not toBe: activity_log stores the causer key as a string.
        ->and($activity->causer_id)->toEqual($this->admin->id)
        // The morph alias from AppServiceProvider, not the class name.
        ->and($activity->causer_type)->toBe($this->admin->getMorphClass());
});

it('warns when featuring a station that is powered off', function () {
    $station = Station::factory()->create([
        'name' => 'Sleeping FM',
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $this->post(route('admin.stations.feature', $station))
        ->assertRedirect()
        ->assertSessionHas('status', fn (string $status) => str_contains($status, 'powered off'));

    // Still featured — the warning is information, not a refusal.
    expect($station->fresh()->featured)->toBeTrue();
});

it('does not let a signed-out visitor feature a station', function () {
    auth('admin')->logout();

    $station = Station::factory()->create();

    $this->post(route('admin.stations.feature', $station))
        ->assertRedirect(route('admin.login'));

    expect($station->fresh()->featured)->toBeFalse();
});

it('does not let a station owner feature their own station', function () {
    auth('admin')->logout();

    $user = User::factory()->create();
    $station = Station::factory()->for($user)->create();

    // The guard is named explicitly. actingAs() without one resolves the
    // DEFAULT guard, and the beforeEach above has already pointed that at
    // `admin` — so the bare call would install this customer as the admin and
    // the test would prove the opposite of what it claims.
    $this->actingAs($user, 'web')
        ->post(route('admin.stations.feature', $station))
        ->assertRedirect(route('admin.login'));

    expect($station->fresh()->featured)->toBeFalse();
});
