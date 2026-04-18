<?php

use App\Models\Admin;
use App\Models\AuthenticationLog;
use App\Notifications\AdminLoginAbuseDetected;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    $this->admin = Admin::factory()->create();
});

it('does nothing when no IP exceeds the threshold', function () {
    Notification::fake();

    for ($i = 0; $i < 3; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '1.2.3.4',
            'login_at' => now()->subMinutes(5),
            'login_successful' => false,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    Notification::assertNothingSent();
});

it('alerts admins when an IP exceeds 10 failed admin logins in the last hour', function () {
    Notification::fake();

    for ($i = 0; $i < 11; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '9.9.9.9',
            'login_at' => now()->subMinutes(5),
            'login_successful' => false,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    Notification::assertSentTo([$this->admin], AdminLoginAbuseDetected::class);
});

it('ignores successful logins and old entries', function () {
    Notification::fake();

    for ($i = 0; $i < 11; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '8.8.8.8',
            'login_at' => now()->subHours(3),
            'login_successful' => false,
        ]);
    }
    for ($i = 0; $i < 11; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '7.7.7.7',
            'login_at' => now()->subMinutes(5),
            'login_successful' => true,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    Notification::assertNothingSent();
});

it('stores notifications in the database so filament renders them', function () {
    for ($i = 0; $i < 11; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '6.6.6.6',
            'login_at' => now()->subMinutes(5),
            'login_successful' => false,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    expect($this->admin->notifications()->count())->toBe(1);
});
