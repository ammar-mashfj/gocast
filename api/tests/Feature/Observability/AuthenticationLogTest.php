<?php

use App\Models\Admin;
use App\Models\AuthenticationLog;
use App\Models\User;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;

it('writes an authentication log row when an admin logs in', function () {
    $admin = Admin::factory()->create();

    event(new Login('admin', $admin, remember: false));

    $this->assertDatabaseHas('authentication_log', [
        'authenticatable_id' => $admin->id,
        'authenticatable_type' => 'admin',
        'login_successful' => true,
    ]);
});

it('writes an authentication log row when a user logs in', function () {
    $user = User::factory()->create();

    event(new Login('web', $user, remember: false));

    $this->assertDatabaseHas('authentication_log', [
        'authenticatable_id' => $user->id,
        'authenticatable_type' => 'user',
        'login_successful' => true,
    ]);
});

it('records a failed login attempt for a known user', function () {
    $user = User::factory()->create();

    event(new Failed('web', $user, ['email' => $user->email]));

    $this->assertDatabaseHas('authentication_log', [
        'authenticatable_id' => $user->id,
        'authenticatable_type' => 'user',
        'login_successful' => false,
    ]);
});

it('ignores failed login attempts with no known user', function () {
    event(new Failed('web', null, ['email' => 'ghost@nowhere.test']));

    expect(AuthenticationLog::count())->toBe(0);
});

it('stamps logout_at on the most recent login row on logout', function () {
    $admin = Admin::factory()->create();
    event(new Login('admin', $admin, remember: false));

    event(new Logout('admin', $admin));

    $log = AuthenticationLog::where('authenticatable_id', $admin->id)->latest('id')->first();
    expect($log->logout_at)->not->toBeNull();
});

it('exposes authentications() on the authenticatable', function () {
    $admin = Admin::factory()->create();
    event(new Login('admin', $admin, remember: false));

    expect($admin->authentications()->count())->toBe(1);
});
