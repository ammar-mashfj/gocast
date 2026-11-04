<?php

use App\Models\User;
use App\Notifications\PasswordResetCode as PasswordResetCodeNotification;
use App\Rules\PassesTurnstile;
use App\Services\MxLookup;
use App\Services\Turnstile;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;

beforeEach(function () {
    Notification::fake();
});

function registerWithToken(?string $token): TestResponse
{
    return test()->postJson('/api/auth/register', array_filter([
        'name' => 'Dana',
        'email' => 'dj@example.com',
        'password' => 'a-typed-password',
        'password_confirmation' => 'a-typed-password',
        'turnstile_token' => $token,
    ]));
}

function fakeSiteverify(mixed $answer, int $status = 200): void
{
    Http::fake([
        MxLookup::ENDPOINT.'*' => Http::response(['Status' => 0, 'Answer' => []]),
        Turnstile::ENDPOINT => is_callable($answer) ? $answer : Http::response($answer, $status),
    ]);
}

describe('sign-up with no secret key', function () {
    it('signs up without a token and never calls Cloudflare', function () {
        config(['services.turnstile.secret' => null]);
        fakeSiteverify(['success' => false]);

        registerWithToken(null)->assertCreated();

        Http::assertNotSent(fn (Request $request) => $request->url() === Turnstile::ENDPOINT);
    });
});

describe('sign-up with a secret key', function () {
    beforeEach(function () {
        config(['services.turnstile.secret' => 'test-secret']);
    });

    it('signs up when Cloudflare accepts the token', function () {
        fakeSiteverify(['success' => true]);

        registerWithToken('good-token')->assertCreated();

        Http::assertSent(fn (Request $request) => $request->url() === Turnstile::ENDPOINT
            && $request['secret'] === 'test-secret'
            && $request['response'] === 'good-token');
    });

    it('refuses a token Cloudflare refuses', function () {
        fakeSiteverify(['success' => false, 'error-codes' => ['invalid-input-response']]);

        registerWithToken('bad-token')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['turnstile_token' => PassesTurnstile::MESSAGE]);

        expect(User::where('email', 'dj@example.com')->exists())->toBeFalse();
    });

    it('refuses a sign-up with no token', function () {
        fakeSiteverify(['success' => true]);

        registerWithToken(null)->assertJsonValidationErrors(['turnstile_token' => PassesTurnstile::MESSAGE]);

        expect(User::where('email', 'dj@example.com')->exists())->toBeFalse();
    });

    it('lets the sign-up through when Cloudflare is down', function () {
        fakeSiteverify(['error' => 'oops'], 503);

        registerWithToken('any-token')->assertCreated();
    });

    it('lets the sign-up through when our secret key is wrong', function () {
        fakeSiteverify(['success' => false, 'error-codes' => ['invalid-input-secret']]);

        registerWithToken('any-token')->assertCreated();
    });

    it('lets the sign-up through when Cloudflare has an internal error', function () {
        fakeSiteverify(['success' => false, 'error-codes' => ['internal-error']]);

        registerWithToken('any-token')->assertCreated();
    });

    it('lets the sign-up through when Cloudflare answers without a verdict', function () {
        fakeSiteverify(['unexpected' => 'shape']);

        registerWithToken('any-token')->assertCreated();
    });

    it('signs up with a token from the sign-up widget', function () {
        fakeSiteverify(['success' => true, 'action' => 'register']);

        registerWithToken('good-token')->assertCreated();
    });

    it('refuses a token minted by another form\'s widget', function () {
        fakeSiteverify(['success' => true, 'action' => 'login']);

        registerWithToken('login-token')
            ->assertJsonValidationErrors(['turnstile_token' => PassesTurnstile::MESSAGE]);

        expect(User::where('email', 'dj@example.com')->exists())->toBeFalse();
    });
});

describe('sign-in and forgot password with a secret key', function () {
    beforeEach(function () {
        config(['services.turnstile.secret' => 'test-secret']);
        $this->user = User::factory()->create(['email' => 'real@test.test', 'password' => Hash::make('secret-pass')]);
    });

    it('signs in when Cloudflare accepts the token', function () {
        fakeSiteverify(['success' => true]);

        test()->postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'secret-pass', 'turnstile_token' => 'good-token'])
            ->assertSuccessful();
    });

    it('refuses a sign-in without a token, even with the right password', function () {
        fakeSiteverify(['success' => true]);

        test()->postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'secret-pass'])
            ->assertJsonValidationErrors('turnstile_token');
    });

    it('refuses a sign-in Cloudflare refuses, with the bot message', function () {
        fakeSiteverify(['success' => false, 'error-codes' => ['invalid-input-response']]);

        test()->postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'secret-pass', 'turnstile_token' => 'bad-token'])
            ->assertUnprocessable()
            ->assertJsonPath('message', PassesTurnstile::MESSAGE);
    });

    it('sends a reset code when Cloudflare accepts the token', function () {
        fakeSiteverify(['success' => true]);

        test()->postJson('/api/auth/password/forgot', ['email' => 'real@test.test', 'turnstile_token' => 'good-token'])
            ->assertSuccessful();

        Notification::assertSentTo($this->user, PasswordResetCodeNotification::class);
    });

    it('sends no email when Cloudflare refuses the token', function () {
        fakeSiteverify(['success' => false, 'error-codes' => ['timeout-or-duplicate']]);

        test()->postJson('/api/auth/password/forgot', ['email' => 'real@test.test', 'turnstile_token' => 'used-token'])
            ->assertJsonValidationErrors('turnstile_token');

        Notification::assertNothingSent();
    });
});
