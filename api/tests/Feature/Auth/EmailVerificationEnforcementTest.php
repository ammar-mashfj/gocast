<?php

use App\Models\User;

use function Pest\Laravel\actingAs;

it('blocks unverified users from productive routes with a tagged 403', function (string $method, string $path) {
    $user = User::factory()->unverified()->create();

    actingAs($user, 'sanctum')
        ->json($method, $path)
        ->assertForbidden()
        ->assertJson([
            'message' => 'Your email address is not verified.',
            'code' => 'email_unverified',
        ]);
})->with([
    'list stations' => ['get', '/api/stations'],
    'create station' => ['post', '/api/stations'],
    'upload image' => ['post', '/api/upload/images'],
]);

it('allows verified users through the verified gate', function () {
    $user = User::factory()->create();

    actingAs($user, 'sanctum')
        ->getJson('/api/stations')
        ->assertSuccessful();
});

it('lets unverified users fetch their own profile', function () {
    $user = User::factory()->unverified()->create();

    actingAs($user, 'sanctum')
        ->getJson('/api/user')
        ->assertSuccessful();
});

it('lets unverified users log out', function () {
    $user = User::factory()->unverified()->create();
    $token = $user->createToken('test')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/logout')
        ->assertSuccessful();
});

it('allows unverified users to request a new verification email', function () {
    $user = User::factory()->unverified()->create();

    actingAs($user, 'sanctum')
        ->postJson('/api/email/resend')
        ->assertSuccessful()
        ->assertJson(['message' => 'Verification email sent.']);
});
