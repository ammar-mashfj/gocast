<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;

/**
 * Deletion is confirmed by typing the account email, never by password.
 *
 * The regression this guards: a `current_password` requirement on this route
 * is unsatisfiable for Google sign-in accounts, which have no password at all
 * — those users could not delete their own account by any means.
 */
beforeEach(function () {
    Notification::fake();
});

it('lets a Google account with no password delete itself', function () {
    $user = User::factory()->create([
        'password' => null,
        'google_id' => '109876543210987654321',
    ]);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => $user->email])
        ->assertSuccessful();

    expect(User::withTrashed()->findOrFail($user->id)->trashed())->toBeTrue();
});

it('deletes a password account without asking for the password', function () {
    $user = User::factory()->create(['password' => Hash::make('old-pass')]);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => $user->email])
        ->assertSuccessful();

    expect(User::withTrashed()->findOrFail($user->id)->trashed())->toBeTrue();
});

it('ignores case and surrounding whitespace in the typed email', function () {
    $user = User::factory()->create(['email' => 'Dj@Example.com']);

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => '  dj@EXAMPLE.com '])
        ->assertSuccessful();

    expect(User::withTrashed()->findOrFail($user->id)->trashed())->toBeTrue();
});

it('rejects a mismatched confirmation', function () {
    $user = User::factory()->create();

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => 'someone-else@example.com'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('confirmation');

    expect($user->fresh()->trashed())->toBeFalse();
});

it('rejects a missing confirmation', function () {
    $user = User::factory()->create();

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors('confirmation');

    expect($user->fresh()->trashed())->toBeFalse();
});

it('will not let one user delete another by typing their email', function () {
    $user = User::factory()->create();
    $victim = User::factory()->create();

    actingAs($user, 'sanctum')
        ->deleteJson('/api/account', ['confirmation' => $victim->email])
        ->assertStatus(422);

    expect($user->fresh()->trashed())->toBeFalse();
    expect($victim->fresh()->trashed())->toBeFalse();
});
