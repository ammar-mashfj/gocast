<?php

use App\Models\Admin;
use App\Services\Totp;
use Database\Factories\AdminFactory;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    test()->withoutVite();
});

function adminTwoFactorCode(string $secret = AdminFactory::TWO_FACTOR_SECRET): string
{
    $totp = new Totp;

    return $totp->code($secret, $totp->currentStep());
}

function passAdminPassword(Admin $admin): void
{
    test()->post(route('admin.login.store'), [
        'email' => $admin->email,
        'password' => 'password',
    ])->assertRedirect(route('admin.two-factor.challenge'));
}

it('asks for a code after the password and signs nobody in yet', function () {
    $admin = Admin::factory()->create();

    passAdminPassword($admin);

    $this->assertGuest('admin');
    $this->get(route('admin.two-factor.challenge'))->assertOk()->assertSee('Enter your sign-in code');
});

it('signs in with the right code and records the login', function () {
    $admin = Admin::factory()->create(['last_login_at' => null]);

    passAdminPassword($admin);

    $this->post(route('admin.two-factor.verify'), ['code' => adminTwoFactorCode()])
        ->assertRedirect(route('admin.stations.index'));

    $this->assertAuthenticatedAs($admin, 'admin');
    expect($admin->fresh()->last_login_at)->not->toBeNull();
});

it('accepts the code with a space in the middle', function () {
    $admin = Admin::factory()->create();
    $code = adminTwoFactorCode();

    passAdminPassword($admin);

    $this->post(route('admin.two-factor.verify'), ['code' => substr($code, 0, 3).' '.substr($code, 3)])
        ->assertRedirect(route('admin.stations.index'));

    $this->assertAuthenticatedAs($admin, 'admin');
});

it('refuses a wrong code', function () {
    $admin = Admin::factory()->create();

    passAdminPassword($admin);

    $wrong = adminTwoFactorCode() === '000000' ? '111111' : '000000';

    $this->post(route('admin.two-factor.verify'), ['code' => $wrong])
        ->assertSessionHasErrors('code');

    $this->assertGuest('admin');
});

it('refuses a code that was already used', function () {
    $admin = Admin::factory()->create();
    $code = adminTwoFactorCode();

    passAdminPassword($admin);
    $this->post(route('admin.two-factor.verify'), ['code' => $code]);
    $this->post(route('admin.logout'));

    passAdminPassword($admin);
    $this->post(route('admin.two-factor.verify'), ['code' => $code])
        ->assertSessionHasErrors('code');

    $this->assertGuest('admin');
});

it('sends the admin back to the password after five wrong codes', function () {
    $admin = Admin::factory()->create();
    $wrong = adminTwoFactorCode() === '000000' ? '111111' : '000000';

    passAdminPassword($admin);

    foreach (range(1, 4) as $attempt) {
        $this->post(route('admin.two-factor.verify'), ['code' => $wrong])->assertSessionHasErrors('code');
    }

    $this->post(route('admin.two-factor.verify'), ['code' => $wrong])
        ->assertRedirect(route('admin.login'));

    // The pending sign-in is gone: even the right code does nothing now.
    $this->post(route('admin.two-factor.verify'), ['code' => adminTwoFactorCode()])
        ->assertRedirect(route('admin.login'));
    $this->assertGuest('admin');
});

it('expires a pending sign-in after five minutes', function () {
    $admin = Admin::factory()->create();

    passAdminPassword($admin);

    $this->travel(6)->minutes();

    $this->post(route('admin.two-factor.verify'), ['code' => adminTwoFactorCode()])
        ->assertRedirect(route('admin.login'));
    $this->assertGuest('admin');
});

it('does not show the code page without a password first', function () {
    $this->get(route('admin.two-factor.challenge'))->assertRedirect(route('admin.login'));
});

it('sends an admin without two-factor to set it up before any panel page', function () {
    $admin = Admin::factory()->withoutTwoFactor()->create();

    $this->actingAs($admin, 'admin')
        ->get(route('admin.stations.index'))
        ->assertRedirect(route('admin.two-factor.setup'));
});

it('lets an admin without two-factor sign out', function () {
    $admin = Admin::factory()->withoutTwoFactor()->create();

    $this->actingAs($admin, 'admin')
        ->post(route('admin.logout'))
        ->assertRedirect(route('admin.login'));

    $this->assertGuest('admin');
});

it('turns two-factor on once a code from the new secret is confirmed', function () {
    $admin = Admin::factory()->withoutTwoFactor()->create();

    $this->actingAs($admin, 'admin')
        ->get(route('admin.two-factor.setup'))
        ->assertOk()
        ->assertSee('Set up two-factor sign-in');

    $secret = session('admin.two_factor_setup_secret');
    expect($secret)->toBeString()->toHaveLength(32);

    // Nothing is saved until the code is confirmed.
    expect($admin->fresh()->hasTwoFactorEnabled())->toBeFalse();

    $this->post(route('admin.two-factor.confirm'), ['code' => adminTwoFactorCode($secret)])
        ->assertRedirect(route('admin.stations.index'));

    $admin->refresh();
    expect($admin->hasTwoFactorEnabled())->toBeTrue()
        ->and($admin->two_factor_secret)->toBe($secret);

    $this->get(route('admin.stations.index'))->assertOk();
});

it('keeps two-factor off when the setup code is wrong', function () {
    $admin = Admin::factory()->withoutTwoFactor()->create();

    $this->actingAs($admin, 'admin')->get(route('admin.two-factor.setup'));
    $secret = session('admin.two_factor_setup_secret');
    $wrong = adminTwoFactorCode($secret) === '000000' ? '111111' : '000000';

    $this->post(route('admin.two-factor.confirm'), ['code' => $wrong])
        ->assertSessionHasErrors('code');

    expect($admin->fresh()->hasTwoFactorEnabled())->toBeFalse();
});

it('stores the secret encrypted', function () {
    $admin = Admin::factory()->create();

    $raw = DB::table('admins')->where('id', $admin->id)->value('two_factor_secret');

    expect($raw)->not->toBe(AdminFactory::TWO_FACTOR_SECRET)
        ->and($admin->fresh()->two_factor_secret)->toBe(AdminFactory::TWO_FACTOR_SECRET);
});

it('turns two-factor off from the command line', function () {
    $admin = Admin::factory()->create();

    Artisan::call('admin:reset-two-factor', ['email' => $admin->email]);

    expect($admin->fresh()->hasTwoFactorEnabled())->toBeFalse();
});

it('lets the panel run without two-factor when it is switched off in config', function () {
    config(['security.admin_two_factor_required' => false]);

    $admin = Admin::factory()->withoutTwoFactor()->create();

    $this->actingAs($admin, 'admin')
        ->get(route('admin.stations.index'))
        ->assertOk();
});
