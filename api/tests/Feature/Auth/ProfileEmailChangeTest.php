<?php

use App\Models\User;
use App\Notifications\EmailChangedNotification;
use App\Notifications\VerifyEmailCode;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    Notification::fake();
});

it('clears the verified flag and issues a new code when a verified user changes email', function () {
    $user = User::factory()->create([
        'email' => 'old@test.test',
        'password' => Hash::make('secret-pass'),
    ]);

    $response = actingAs($user, 'sanctum')
        ->patchJson('/api/account/profile', [
            'email' => 'new@test.test',
            'current_password' => 'secret-pass',
        ]);

    $response->assertSuccessful()
        ->assertJsonPath('data.email', 'new@test.test')
        ->assertJsonPath('data.email_verified_at', null);

    expect($user->fresh()->hasVerifiedEmail())->toBeFalse();
    Notification::assertSentTo($user->fresh(), VerifyEmailCode::class);
});

it('notifies the previous email address when the email changes', function () {
    $user = User::factory()->create([
        'email' => 'old@test.test',
        'password' => Hash::make('secret-pass'),
    ]);

    actingAs($user, 'sanctum')
        ->patchJson('/api/account/profile', [
            'email' => 'new@test.test',
            'current_password' => 'secret-pass',
        ])
        ->assertSuccessful();

    Notification::assertSentOnDemand(EmailChangedNotification::class, function ($notification, array $channels, $notifiable) {
        return $notifiable->routes['mail'] === 'old@test.test';
    });
});

it('rejects an email change with a wrong current password', function () {
    $user = User::factory()->create([
        'email' => 'old@test.test',
        'password' => Hash::make('correct-pass'),
    ]);

    actingAs($user, 'sanctum')
        ->patchJson('/api/account/profile', [
            'email' => 'new@test.test',
            'current_password' => 'wrong-pass',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['current_password']);

    expect($user->fresh()->email)->toBe('old@test.test');
    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
    Notification::assertNothingSent();
});

it('requires current password when email is being changed', function () {
    $user = User::factory()->create(['email' => 'old@test.test']);

    actingAs($user, 'sanctum')
        ->patchJson('/api/account/profile', ['email' => 'new@test.test'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['current_password']);
});

it('does not require current password for a name-only update', function () {
    $user = User::factory()->create(['name' => 'Old', 'email' => 'stay@test.test']);

    actingAs($user, 'sanctum')
        ->patchJson('/api/account/profile', ['name' => 'New'])
        ->assertSuccessful()
        ->assertJsonPath('data.name', 'New');

    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
    Notification::assertNothingSent();
});

it('does not reset verification when the email is submitted unchanged', function () {
    $user = User::factory()->create(['email' => 'same@test.test']);

    actingAs($user, 'sanctum')
        ->patchJson('/api/account/profile', ['email' => 'same@test.test'])
        ->assertSuccessful();

    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
    Notification::assertNothingSent();
});
