<?php

use App\Models\EmailVerificationCode;
use App\Models\User;
use App\Notifications\VerifyEmailCode;
use Illuminate\Auth\Events\Verified;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\assertDatabaseHas;
use function Pest\Laravel\assertDatabaseMissing;

it('issues a 6-digit code, persists its hash, and emails the plaintext on resend', function () {
    Notification::fake();
    $user = User::factory()->unverified()->create();

    actingAs($user, 'sanctum')
        ->postJson('/api/email/resend')
        ->assertSuccessful()
        ->assertJson(['message' => 'Verification email sent.']);

    Notification::assertSentTo($user, VerifyEmailCode::class, function (VerifyEmailCode $n) use ($user) {
        $record = EmailVerificationCode::find($user->id);
        expect($n->code)->toMatch('/^\d{6}$/');
        expect(Hash::check($n->code, $record->code_hash))->toBeTrue();

        return true;
    });
});

it('verifies the user, fires Verified, and consumes the code on correct submission', function () {
    Event::fake([Verified::class]);
    Notification::fake();

    $user = User::factory()->unverified()->create();
    $user->sendEmailVerificationNotification();

    $plain = null;
    Notification::assertSentTo($user, VerifyEmailCode::class, function (VerifyEmailCode $n) use (&$plain) {
        $plain = $n->code;

        return true;
    });

    actingAs($user, 'sanctum')
        ->postJson('/api/email/verify', ['code' => $plain])
        ->assertSuccessful()
        ->assertJson(['message' => 'Email verified.']);

    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
    assertDatabaseMissing('email_verification_codes', ['user_id' => $user->id]);
    Event::assertDispatched(Verified::class);
});

it('rejects a wrong code and increments attempts', function () {
    $user = User::factory()->unverified()->create();
    $user->sendEmailVerificationNotification();

    actingAs($user, 'sanctum')
        ->postJson('/api/email/verify', ['code' => '000000'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['code']);

    assertDatabaseHas('email_verification_codes', [
        'user_id' => $user->id,
        'attempts' => 1,
    ]);
    expect($user->fresh()->hasVerifiedEmail())->toBeFalse();
});

it('rejects an expired code even when the digits match', function () {
    $user = User::factory()->unverified()->create();
    Notification::fake();
    $user->sendEmailVerificationNotification();
    $plain = null;
    Notification::assertSentTo($user, VerifyEmailCode::class, function (VerifyEmailCode $n) use (&$plain) {
        $plain = $n->code;

        return true;
    });

    EmailVerificationCode::where('user_id', $user->id)->update(['expires_at' => now()->subMinute()]);

    actingAs($user, 'sanctum')
        ->postJson('/api/email/verify', ['code' => $plain])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['code']);
});

it('locks out after the max attempts is reached', function () {
    $user = User::factory()->unverified()->create();
    $user->sendEmailVerificationNotification();

    EmailVerificationCode::where('user_id', $user->id)
        ->update(['attempts' => EmailVerificationCode::MAX_ATTEMPTS]);

    actingAs($user, 'sanctum')
        ->postJson('/api/email/verify', ['code' => '123456'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['code']);
});

it('rejects a missing or malformed code', function (array $payload) {
    $user = User::factory()->unverified()->create();

    actingAs($user, 'sanctum')
        ->postJson('/api/email/verify', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['code']);
})->with([
    'missing' => [[]],
    'too short' => [['code' => '123']],
    'non-numeric' => [['code' => 'abcdef']],
]);

it('short-circuits resend when the user is already verified and returns the user payload', function () {
    Notification::fake();
    $user = User::factory()->create(); // verified by default

    actingAs($user, 'sanctum')
        ->postJson('/api/email/resend')
        ->assertSuccessful()
        ->assertJson(['message' => 'Email already verified.'])
        ->assertJsonPath('data.id', $user->id)
        ->assertJsonPath('data.email', $user->email);

    Notification::assertNothingSent();
});

it('short-circuits verify when the user is already verified and returns the user payload', function () {
    $user = User::factory()->create();

    actingAs($user, 'sanctum')
        ->postJson('/api/email/verify', ['code' => '123456'])
        ->assertSuccessful()
        ->assertJson(['message' => 'Email already verified.'])
        ->assertJsonPath('data.id', $user->id);
});

it('returns the user payload alongside the message on resend', function () {
    Notification::fake();
    $user = User::factory()->unverified()->create();

    actingAs($user, 'sanctum')
        ->postJson('/api/email/resend')
        ->assertSuccessful()
        ->assertJsonPath('data.id', $user->id)
        ->assertJson(['message' => 'Verification email sent.']);
});
