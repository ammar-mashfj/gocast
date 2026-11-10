<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

use function Pest\Laravel\withServerVariables;

/*
| Laravel trusts X-Forwarded-For only from loopback (bootstrap/app.php).
| A client that reaches PHP from anywhere else — someone who found the
| origin IP and skipped Cloudflare — must not be able to pick its own
| `$request->ip()`, or every IP-keyed limit falls to a rotating header.
*/

beforeEach(function () {
    User::factory()->create([
        'email' => 'real@test.test',
        'password' => Hash::make('correct-pass'),
    ]);

    RateLimiter::clear('login:real@test.test|203.0.113.9');
});

it('ignores a forged X-Forwarded-For from a direct client', function () {
    for ($i = 1; $i <= 5; $i++) {
        withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])
            ->postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'wrong'], [
                'X-Forwarded-For' => "198.51.100.{$i}",
            ])
            ->assertUnauthorized();
    }

    // A fresh forged address does not buy a fresh counter.
    withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])
        ->postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'correct-pass'], [
            'X-Forwarded-For' => '198.51.100.99',
        ])
        ->assertStatus(429);
});

it('still honours X-Forwarded-For from loopback', function () {
    for ($i = 1; $i <= 6; $i++) {
        RateLimiter::clear("login:real@test.test|198.51.100.{$i}");

        withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/api/auth/login', ['email' => 'real@test.test', 'password' => 'wrong'], [
                'X-Forwarded-For' => "198.51.100.{$i}",
            ])
            ->assertUnauthorized();
    }
});
