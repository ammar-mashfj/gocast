<?php

use App\Models\Admin;
use Illuminate\Auth\Events\Login;

it('updates last_login_at when an admin logs in', function () {
    $admin = Admin::factory()->create(['last_login_at' => null]);

    event(new Login('admin', $admin, remember: false));

    expect($admin->fresh()->last_login_at)->not->toBeNull();
});

it('does not update last_login_at for non-admin guards', function () {
    $admin = Admin::factory()->create(['last_login_at' => null]);

    event(new Login('web', $admin, remember: false));

    expect($admin->fresh()->last_login_at)->toBeNull();
});
