<?php

use App\Models\User;
use Illuminate\Auth\Events\Login;

it('updates users.last_login_at when a user logs in via the web guard', function () {
    $user = User::factory()->create(['last_login_at' => null]);

    event(new Login('web', $user, remember: false));

    expect($user->fresh()->last_login_at)->not->toBeNull();
});

it('does not update users.last_login_at when an admin logs in', function () {
    $user = User::factory()->create(['last_login_at' => null]);

    event(new Login('admin', $user, remember: false));

    expect($user->fresh()->last_login_at)->toBeNull();
});
