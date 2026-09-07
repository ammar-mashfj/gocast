<?php

use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    test()->withoutVite();

    test()->actingAs(Admin::factory()->create(), 'admin');

    // The real row, not a factory one: the plans table is seeded by migration
    // and `pro` is uniquely indexed, so making a second one collides.
    $this->pro = Plan::where('slug', 'pro')->sole();
});

/** The happy path, field by field, because every one of them is load-bearing. */
it('creates the account and its station on the chosen plan', function () {
    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana Reyes',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ])->assertRedirect(route('admin.accounts.create'));

    $user = User::where('email', 'dana@example.com')->sole();

    expect($user->name)->toBe('Dana Reyes')
        ->and($user->plan_id)->toBe($this->pro->id)
        ->and(Hash::check('a-typed-password', $user->password))->toBeTrue();

    $station = $user->stations()->sole();

    expect($station->name)->toBe('Midnight FM')
        ->and($station->slug)->toBe('midnight-fm')
        ->and($station->icecast_mount)->toBe('/stream/midnight-fm');
});

/**
 * The one that turns a working account into a broken one. Every productive
 * route sits behind `verified`, so an unverified provisioned account logs in
 * and then 403s on its own station.
 */
it('marks the email verified so the account can use the app immediately', function () {
    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ]);

    $user = User::where('email', 'dana@example.com')->sole();

    expect($user->hasVerifiedEmail())->toBeTrue();

    // Proven end to end rather than by the column alone: the column is only
    // interesting because of what the middleware does with it.
    $this->actingAs($user, 'sanctum')->getJson('/api/stations')->assertOk();
});

/**
 * Written as one insert with a single timestamp rather than two clock reads,
 * so the two columns cannot straddle a second boundary and leave an account
 * that looks like it was verified after it was created.
 */
it('verifies the email at exactly the moment the account is created', function () {
    DB::enableQueryLog();

    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ]);

    $user = User::where('email', 'dana@example.com')->sole();

    expect($user->email_verified_at->equalTo($user->created_at))->toBeTrue();

    // The columns are second-precision, so equality on its own would hold by
    // luck almost every run. What is actually being guarded is the shape that
    // makes them identical: one insert carrying both values, and no follow-up
    // update to stamp verification separately.
    $writes = collect(DB::getQueryLog())
        ->pluck('query')
        ->filter(fn (string $query) => str_contains($query, '`users`'))
        ->filter(fn (string $query) => str_starts_with($query, 'insert') || str_starts_with($query, 'update'));

    expect($writes)->toHaveCount(1)
        ->and($writes->first())->toStartWith('insert');
});

it('leaves the station stopped so nothing reaches docker', function () {
    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ]);

    expect(Station::sole()->desired_state)->toBe(Station::STATE_STOPPED);
});

/**
 * The guarantee, not a detail: provisioning is used for accounts arranged
 * off-platform, and a verification code landing in a stranger's inbox for an
 * account they never asked for is the one outcome this page must never
 * produce. Both fakes, because a notification and a raw Mailable are separate
 * paths out of the app.
 */
it('sends no mail of any kind', function () {
    Notification::fake();
    Mail::fake();

    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ]);

    Notification::assertNothingSent();
    Mail::assertNothingSent();
    Mail::assertNothingQueued();
});

it('refuses to create an account without a password', function () {
    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => '',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ])->assertSessionHasErrors('password');

    // Nothing half-created: no account anyone would have to chase a password for.
    expect(User::where('email', 'dana@example.com')->exists())->toBeFalse()
        ->and(Station::count())->toBe(0);
});

it('refuses a password too short to be worth setting', function () {
    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'short',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ])->assertSessionHasErrors('password');

    expect(User::where('email', 'dana@example.com')->exists())->toBeFalse();
});

/**
 * The typed password is echoed back exactly once. That is what catches a typo
 * here rather than leaving the account holder unable to log in — and it has to
 * be gone on the next load, since only the hash is kept.
 */
it('shows the password back once and never again', function () {
    $this->followingRedirects()
        ->post(route('admin.accounts.store'), [
            'name' => 'Dana',
            'email' => 'dana@example.com',
            'password' => 'a-typed-password',
            'plan_id' => $this->pro->id,
            'station_name' => 'Midnight FM',
        ])
        ->assertOk()
        ->assertSee('Account created')
        ->assertSee('a-typed-password');

    $this->get(route('admin.accounts.create'))
        ->assertOk()
        ->assertDontSee('a-typed-password')
        ->assertDontSee('Account created');
});

it('rejects an email that already has an account and points at access requests', function () {
    User::factory()->create(['email' => 'taken@example.com']);

    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'taken@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ])->assertSessionHasErrors(['email' => 'taken@example.com already has an account. Move it onto a plan from Access requests instead — this form only creates new accounts.']);

    expect(Station::count())->toBe(0);
});

/**
 * Soft deletes keep the row, and the email column is uniquely indexed, so this
 * collision is real and the generic "already taken" message would send an
 * admin looking for an account that does not appear anywhere in the panel.
 */
it('explains that a closed account still holds its email', function () {
    $user = User::factory()->create(['email' => 'gone@example.com']);
    $user->delete();

    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'gone@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ])->assertSessionHasErrors(['email' => 'gone@example.com belongs to a closed account. Its row still holds the address, so it cannot be reused here.']);
});

it('rejects a plan that does not exist', function () {
    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => 9999,
        'station_name' => 'Midnight FM',
    ])->assertSessionHasErrors('plan_id');

    expect(User::where('email', 'dana@example.com')->exists())->toBeFalse();
});

it('records which admin provisioned the account', function () {
    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ]);

    $activity = Activity::where('description', 'provisioned account')->sole();

    expect($activity->causer)->toBeInstanceOf(Admin::class)
        ->and($activity->subject->email)->toBe('dana@example.com')
        ->and($activity->properties['station'])->toBe('midnight-fm');
});

it('is closed to anyone who is not signed in as an admin', function () {
    auth('admin')->logout();

    $this->get(route('admin.accounts.create'))->assertRedirect(route('admin.login'));

    $this->post(route('admin.accounts.store'), [
        'name' => 'Dana',
        'email' => 'dana@example.com',
        'password' => 'a-typed-password',
        'plan_id' => $this->pro->id,
        'station_name' => 'Midnight FM',
    ])->assertRedirect(route('admin.login'));

    expect(User::where('email', 'dana@example.com')->exists())->toBeFalse();
});
