<?php

use App\Models\User;
use App\Notifications\VerifyEmailCode;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\postJson;

it('issues a fresh verification code when an unverified user logs in', function () {
    Notification::fake();
    $user = User::factory()->unverified()->create([
        'email' => 'fresh@test.test',
        'password' => Hash::make('secret-pass'),
    ]);

    postJson('/api/auth/login', ['email' => $user->email, 'password' => 'secret-pass'])
        ->assertSuccessful()
        ->assertJsonPath('data.email_verified_at', null);

    Notification::assertSentTo($user, VerifyEmailCode::class);
});

it('does not re-send a verification code to an already-verified user on login', function () {
    Notification::fake();
    $user = User::factory()->create(['password' => Hash::make('secret-pass')]);

    postJson('/api/auth/login', ['email' => $user->email, 'password' => 'secret-pass'])
        ->assertSuccessful();

    Notification::assertNothingSent();
});

it('sets the Sanctum token as an HttpOnly cookie instead of exposing it in JSON', function () {
    Notification::fake();
    $user = User::factory()->create(['password' => Hash::make('secret-pass')]);

    $response = postJson('/api/auth/login', ['email' => $user->email, 'password' => 'secret-pass'])
        ->assertSuccessful()
        ->assertCookie('token');

    expect($response->json('token'))->toBeNull();

    $tokenCookie = collect($response->headers->getCookies())
        ->first(fn ($cookie) => $cookie->getName() === 'token');

    expect($tokenCookie)->not->toBeNull();
    expect($tokenCookie->isHttpOnly())->toBeTrue();

    $this->withUnencryptedCookie('token', $tokenCookie->getValue())
        ->getJson('/api/user')
        ->assertSuccessful()
        ->assertJsonPath('data.id', $user->id);
});
