<?php

use App\Models\User;
use App\Notifications\PasswordChangedNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;

it('notifies the user when their password changes via settings', function () {
    Notification::fake();

    $user = User::factory()->create([
        'password' => Hash::make('old-pass'),
    ]);

    actingAs($user, 'sanctum')
        ->patchJson('/api/account/password', [
            'current_password' => 'old-pass',
            'password' => 'brand-new-pass',
            'password_confirmation' => 'brand-new-pass',
        ])
        ->assertSuccessful();

    Notification::assertSentTo($user->fresh(), PasswordChangedNotification::class);
});

it('lets a Google-only user set an initial password without a current password', function () {
    Notification::fake();

    $user = User::factory()->create([
        'google_id' => 'google-123',
        'password' => null,
    ]);

    actingAs($user, 'sanctum')
        ->patchJson('/api/account/password', [
            'password' => 'brand-new-pass',
            'password_confirmation' => 'brand-new-pass',
        ])
        ->assertSuccessful();

    $fresh = $user->fresh();
    expect(Hash::check('brand-new-pass', $fresh->password))->toBeTrue();
    expect($fresh->has_password)->toBeTrue();
    Notification::assertSentTo($fresh, PasswordChangedNotification::class);
});

it('releases unique identifiers when deleting an account so the email can register again', function () {
    Notification::fake();

    $user = User::factory()->create([
        'email' => 'reuse@test.test',
        'google_id' => 'google-reuse',
        'password' => Hash::make('old-pass'),
    ]);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['current_password' => 'old-pass'])
        ->assertSuccessful();

    $deleted = User::withTrashed()->findOrFail($user->id);
    expect($deleted->trashed())->toBeTrue();
    expect($deleted->email)->not->toBe('reuse@test.test');
    expect($deleted->google_id)->toBeNull();

    postJson('/api/auth/register', [
        'name' => 'Reuse',
        'email' => 'reuse@test.test',
        'password' => 'new-pass-123',
        'password_confirmation' => 'new-pass-123',
    ])->assertCreated();
});
