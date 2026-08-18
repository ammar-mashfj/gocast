<?php

use App\Models\Admin;
use App\Models\User;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Support\Facades\Event;

beforeEach(function () {
    test()->withoutVite();
});

it('renders the login page for guests', function () {
    $this->get(route('admin.login'))
        ->assertOk()
        ->assertSee('Sign in');
});

it('authenticates an admin and sends them to the stations page', function () {
    $admin = Admin::factory()->create();

    $this->post(route('admin.login.store'), [
        'email' => $admin->email,
        'password' => 'password',
    ])->assertRedirect(route('admin.stations.index'));

    $this->assertAuthenticatedAs($admin, 'admin');
});

it('records the login timestamp', function () {
    $admin = Admin::factory()->create(['last_login_at' => null]);

    $this->post(route('admin.login.store'), [
        'email' => $admin->email,
        'password' => 'password',
    ]);

    expect($admin->fresh()->last_login_at)->not->toBeNull();
});

it('rejects a wrong password', function () {
    $admin = Admin::factory()->create();

    $this->post(route('admin.login.store'), [
        'email' => $admin->email,
        'password' => 'not-the-password',
    ])->assertSessionHasErrors('email');

    $this->assertGuest('admin');
});

/**
 * The whole point of the separate guard: a customer credential must not be
 * an admin credential, even for a user whose email also exists in `admins`.
 */
it('refuses a customer account on the admin guard', function () {
    $user = User::factory()->create();

    $this->post(route('admin.login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ])->assertSessionHasErrors('email');

    $this->assertGuest('admin');
    $this->assertGuest('web');
});

it('locks out after five failed attempts', function () {
    Event::fake([Lockout::class]);

    $admin = Admin::factory()->create();

    foreach (range(1, 5) as $attempt) {
        $this->post(route('admin.login.store'), [
            'email' => $admin->email,
            'password' => 'wrong',
        ]);
    }

    $this->post(route('admin.login.store'), [
        'email' => $admin->email,
        'password' => 'password',
    ])->assertSessionHasErrors('email');

    Event::assertDispatched(Lockout::class);
    $this->assertGuest('admin');
});

it('redirects guests away from the panel', function () {
    $this->get(route('admin.stations.index'))
        ->assertRedirect(route('admin.login'));
});

/**
 * The panel root, not just its children: `is('admin/*')` does not match the
 * bare `admin` path, which is what made this 401 instead of redirecting.
 */
it('redirects guests from the panel root', function () {
    $this->get('/admin')->assertRedirect(route('admin.login'));
});

it('sends a signed-in admin from the panel root to the stations page', function () {
    $this->actingAs(Admin::factory()->create(), 'admin')
        ->get('/admin')
        ->assertRedirect(route('admin.stations.index'));
});

it('does not let a signed-in customer reach the panel', function () {
    $this->actingAs(User::factory()->create(), 'web')
        ->get(route('admin.stations.index'))
        ->assertRedirect(route('admin.login'));
});

it('sends a signed-in admin from the login page to the panel', function () {
    $this->actingAs(Admin::factory()->create(), 'admin')
        ->get(route('admin.login'))
        ->assertRedirect(route('admin.stations.index'));
});

it('logs out', function () {
    $this->actingAs(Admin::factory()->create(), 'admin')
        ->post(route('admin.logout'))
        ->assertRedirect(route('admin.login'));

    $this->assertGuest('admin');
});
