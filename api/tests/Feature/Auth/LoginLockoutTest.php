<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

use function Pest\Laravel\postJson;

beforeEach(function () {
    // The limiter uses the cache store; flush between tests so attempts from
    // one test don't leak lockouts into another.
    RateLimiter::clear('login:real@test.test|127.0.0.1');
});

it('locks the account after five failed attempts from the same IP', function () {
    User::factory()->create([
        'email' => 'real@test.test',
        'password' => Hash::make('correct-pass'),
    ]);

    for ($i = 0; $i < 5; $i++) {
        postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'wrong'])
            ->assertUnauthorized();
    }

    // Sixth attempt — even with the correct password — is locked out.
    postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'correct-pass'])
        ->assertStatus(429)
        ->assertJsonValidationErrors(['email']);
});

it('clears the lockout counter on a successful login', function () {
    User::factory()->create([
        'email' => 'real@test.test',
        'password' => Hash::make('correct-pass'),
    ]);

    for ($i = 0; $i < 3; $i++) {
        postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'wrong'])
            ->assertUnauthorized();
    }

    postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'correct-pass'])
        ->assertSuccessful();

    // Counter cleared — five fresh failures are allowed before locking again.
    for ($i = 0; $i < 5; $i++) {
        postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'wrong'])
            ->assertUnauthorized();
    }
});
