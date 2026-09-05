<?php

use App\Models\Admin;
use Illuminate\Support\Facades\Hash;

it('resets the password of an existing admin', function () {
    $admin = Admin::factory()->create(['remember_token' => 'stale-token']);

    $this->artisan('admin:reset-password', [
        'email' => $admin->email,
        '--password' => 'a-brand-new-secret',
    ])->assertSuccessful();

    $admin->refresh();

    expect(Hash::check('a-brand-new-secret', $admin->password))->toBeTrue()
        ->and(Hash::check('password', $admin->password))->toBeFalse()
        ->and($admin->remember_token)->toBeNull();
});

it('prompts for the password when the option is omitted', function () {
    $admin = Admin::factory()->create();

    $this->artisan('admin:reset-password', ['email' => $admin->email])
        ->expectsQuestion('New password (min 12 chars)', 'prompted-secret-value')
        ->assertSuccessful();

    expect(Hash::check('prompted-secret-value', $admin->fresh()->password))->toBeTrue();
});

it('rejects a password shorter than 12 characters', function () {
    $admin = Admin::factory()->create();

    $this->artisan('admin:reset-password', [
        'email' => $admin->email,
        '--password' => 'short',
    ])->assertFailed();

    expect(Hash::check('password', $admin->fresh()->password))->toBeTrue();
});

it('fails for an unknown email', function () {
    $this->artisan('admin:reset-password', [
        'email' => 'nobody@example.com',
        '--password' => 'a-brand-new-secret',
    ])->assertFailed();
});
