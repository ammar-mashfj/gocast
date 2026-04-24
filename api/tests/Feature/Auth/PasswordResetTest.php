<?php

use App\Models\PasswordResetCode;
use App\Models\User;
use App\Notifications\PasswordChangedNotification;
use App\Notifications\PasswordResetCode as PasswordResetCodeNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\assertDatabaseMissing;
use function Pest\Laravel\postJson;

beforeEach(function () {
    Notification::fake();
});

it('issues a reset code to a registered user on /password/forgot', function () {
    $user = User::factory()->create(['email' => 'real@test.test']);

    postJson('/api/auth/password/forgot', ['email' => 'real@test.test'])
        ->assertSuccessful()
        ->assertJsonStructure(['message']);

    Notification::assertSentTo($user, PasswordResetCodeNotification::class, function (PasswordResetCodeNotification $n) {
        expect($n->code)->toMatch('/^\d{6}$/');
        $record = PasswordResetCode::find('real@test.test');
        expect(Hash::check($n->code, $record->code_hash))->toBeTrue();

        return true;
    });
});

it('responds identically for unknown emails to prevent enumeration', function () {
    postJson('/api/auth/password/forgot', ['email' => 'ghost@test.test'])
        ->assertSuccessful()
        ->assertJsonStructure(['message']);

    Notification::assertNothingSent();
    assertDatabaseMissing('password_reset_codes', ['email' => 'ghost@test.test']);
});

it('resets the password with a valid code and revokes all tokens', function () {
    $user = User::factory()->create([
        'email' => 'real@test.test',
        'password' => Hash::make('old-pass'),
    ]);
    $user->createToken('session-a');
    $user->createToken('session-b');

    postJson('/api/auth/password/forgot', ['email' => 'real@test.test'])->assertSuccessful();

    $plain = null;
    Notification::assertSentTo($user, PasswordResetCodeNotification::class, function ($n) use (&$plain) {
        $plain = $n->code;

        return true;
    });

    postJson('/api/auth/password/reset', [
        'email' => 'real@test.test',
        'code' => $plain,
        'password' => 'brand-new-pass',
        'password_confirmation' => 'brand-new-pass',
    ])->assertSuccessful();

    $fresh = $user->fresh();
    expect(Hash::check('brand-new-pass', $fresh->password))->toBeTrue();
    expect($fresh->tokens()->count())->toBe(0);
    assertDatabaseMissing('password_reset_codes', ['email' => 'real@test.test']);
    Notification::assertSentTo($fresh, PasswordChangedNotification::class);
});

it('rejects a wrong code and increments attempts', function () {
    $user = User::factory()->create(['email' => 'real@test.test']);
    postJson('/api/auth/password/forgot', ['email' => 'real@test.test'])->assertSuccessful();

    postJson('/api/auth/password/reset', [
        'email' => 'real@test.test',
        'code' => '000000',
        'password' => 'brand-new-pass',
        'password_confirmation' => 'brand-new-pass',
    ])->assertUnprocessable()->assertJsonValidationErrors(['code']);

    expect(PasswordResetCode::find('real@test.test')->attempts)->toBe(1);
    expect(Hash::check('brand-new-pass', $user->fresh()->password))->toBeFalse();
});

it('rejects an expired code', function () {
    $user = User::factory()->create(['email' => 'real@test.test']);
    postJson('/api/auth/password/forgot', ['email' => 'real@test.test'])->assertSuccessful();

    $plain = null;
    Notification::assertSentTo($user, PasswordResetCodeNotification::class, function ($n) use (&$plain) {
        $plain = $n->code;

        return true;
    });

    PasswordResetCode::where('email', 'real@test.test')->update(['expires_at' => now()->subMinute()]);

    postJson('/api/auth/password/reset', [
        'email' => 'real@test.test',
        'code' => $plain,
        'password' => 'brand-new-pass',
        'password_confirmation' => 'brand-new-pass',
    ])->assertUnprocessable()->assertJsonValidationErrors(['code']);
});

it('locks out after max attempts', function () {
    $user = User::factory()->create(['email' => 'real@test.test']);
    postJson('/api/auth/password/forgot', ['email' => 'real@test.test'])->assertSuccessful();

    PasswordResetCode::where('email', 'real@test.test')
        ->update(['attempts' => PasswordResetCode::MAX_ATTEMPTS]);

    postJson('/api/auth/password/reset', [
        'email' => 'real@test.test',
        'code' => '123456',
        'password' => 'brand-new-pass',
        'password_confirmation' => 'brand-new-pass',
    ])->assertUnprocessable()->assertJsonValidationErrors(['code']);
});

it('validates payload shape', function (array $payload) {
    postJson('/api/auth/password/reset', $payload)->assertUnprocessable();
})->with([
    'missing code' => [['email' => 'x@test.test', 'password' => 'longpass1', 'password_confirmation' => 'longpass1']],
    'short password' => [['email' => 'x@test.test', 'code' => '123456', 'password' => 'short', 'password_confirmation' => 'short']],
    'mismatched confirmation' => [['email' => 'x@test.test', 'code' => '123456', 'password' => 'brand-new-pass', 'password_confirmation' => 'different']],
]);
