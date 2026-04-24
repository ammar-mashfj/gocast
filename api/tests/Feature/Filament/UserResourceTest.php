<?php

use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Users\UserResource;
use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Notifications\VerifyEmailCode;
use Illuminate\Support\Facades\Notification;
use Livewire\Livewire;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    Plan::updateOrCreate(['id' => 1], ['name' => 'Free', 'slug' => 'free', 'max_stations' => 1, 'max_listeners' => 100]);
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('lists users', function () {
    $users = User::factory()->count(3)->create();

    Livewire::test(ListUsers::class)
        ->assertCanSeeTableRecords($users);
});

it('marks a user verified and logs activity', function () {
    $user = User::factory()->unverified()->create();

    Livewire::test(ListUsers::class)
        ->callTableAction('mark_verified', $user);

    expect($user->fresh()->email_verified_at)->not->toBeNull();
    expect(Activity::where('event', 'marked_verified')->where('subject_id', $user->id)->exists())->toBeTrue();
});

it('resends a verification email', function () {
    Notification::fake();
    $user = User::factory()->unverified()->create();

    Livewire::test(ListUsers::class)
        ->callTableAction('resend_verification', $user);

    Notification::assertSentTo($user, VerifyEmailCode::class);
});

it('soft-deletes a user with correct email confirmation and cascades to stations', function () {
    $user = User::factory()->create(['email' => 'victim@test.test']);
    $station = Station::factory()->for($user)->create(['name' => 'X', 'slug' => 'x-victim']);
    $user->createToken('auth');

    Livewire::test(ListUsers::class)
        ->callTableAction('delete', $user, ['confirmation' => 'victim@test.test']);

    expect(User::find($user->id))->toBeNull();
    expect(Station::find($station->id))->toBeNull();
    expect($user->fresh()->tokens()->count())->toBe(0);
});

it('refuses soft-delete when the email confirmation is wrong', function () {
    $user = User::factory()->create(['email' => 'safe@test.test']);

    Livewire::test(ListUsers::class)
        ->callTableAction('delete', $user, ['confirmation' => 'wrong@test.test'])
        ->assertHasActionErrors();

    expect(User::find($user->id))->not->toBeNull();
});

it('shows the user detail page with stations', function () {
    $user = User::factory()->create();
    Station::factory()->for($user)->count(2)->create([
        'name' => fn () => fake()->words(2, asText: true),
        'slug' => fn () => fake()->unique()->slug(2),
    ]);

    $this->get(UserResource::getUrl('view', ['record' => $user->id]))
        ->assertOk();
});
