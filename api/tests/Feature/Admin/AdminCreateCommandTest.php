<?php

use App\Models\Admin;
use Illuminate\Support\Facades\Hash;

it('creates an admin with a hashed password', function () {
    $this->artisan('admin:create', [
        'email' => 'ammar@gocast.test',
        '--name' => 'Ammar',
        '--password' => 'secret-password',
    ])->assertExitCode(0);

    $admin = Admin::where('email', 'ammar@gocast.test')->firstOrFail();

    expect($admin->name)->toBe('Ammar');
    expect(Hash::check('secret-password', $admin->password))->toBeTrue();
    expect($admin->two_factor_confirmed_at)->toBeNull();
});

it('fails with a non-zero exit code when the email already exists', function () {
    Admin::factory()->create(['email' => 'taken@gocast.test']);

    $this->artisan('admin:create', [
        'email' => 'taken@gocast.test',
        '--name' => 'Dup',
        '--password' => 'anything-long-enough',
    ])->assertFailed();

    expect(Admin::where('email', 'taken@gocast.test')->count())->toBe(1);
});

it('rejects a password shorter than 12 characters', function () {
    $this->artisan('admin:create', [
        'email' => 'short@gocast.test',
        '--name' => 'Short',
        '--password' => 'tooshort',
    ])->assertFailed();

    expect(Admin::where('email', 'short@gocast.test')->exists())->toBeFalse();
});
