<?php

use App\Models\Admin;
use App\Models\User;
use Spatie\Activitylog\Models\Activity;

it('logs creation of a User using the short "user" morph key', function () {
    $user = User::factory()->create();

    $activity = Activity::where('subject_id', $user->id)
        ->where('subject_type', 'user')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull();
    expect($activity->description)->toBe('created');
});

it('records an Admin as causer with the short "admin" morph key', function () {
    $admin = Admin::factory()->create();

    activity()
        ->causedBy($admin)
        ->performedOn(User::factory()->create())
        ->event('test_event')
        ->log('test');

    $activity = Activity::latest('id')->first();

    expect($activity->causer_type)->toBe('admin');
    expect((string) $activity->causer_id)->toBe((string) $admin->id);
});
