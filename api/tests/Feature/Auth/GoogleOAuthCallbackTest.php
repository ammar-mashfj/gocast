<?php

use App\Models\User;
use App\Notifications\WelcomeNotification;
use Illuminate\Support\Facades\Notification;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;

beforeEach(function () {
    config()->set('services.frontend_url', 'https://gocast.test');
});

function fakeGoogleUser(string $id = 'g-123', string $email = 'g@test.test', string $name = 'Google User'): SocialiteUser
{
    $u = new SocialiteUser;
    $u->id = $id;
    $u->email = $email;
    $u->name = $name;
    $u->avatar = 'https://example.com/avatar.png';

    return $u;
}

function oauthStateCookie(string $state = 'test-oauth-state'): array
{
    return [$state, hash('sha256', $state)];
}

it('renders the popup view and sets an HttpOnly Sanctum cookie on a successful callback', function () {
    Notification::fake();
    $google = fakeGoogleUser();
    [$state, $cookie] = oauthStateCookie();

    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('stateless')->andReturnSelf();
    $provider->shouldReceive('user')->andReturn($google);
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
        ->get('/api/auth/google/callback?state='.$state)
        ->assertSuccessful()
        ->assertViewIs('auth.google-callback')
        ->assertViewHas('frontendOrigin', 'https://gocast.test')
        ->assertViewHas('payload', fn ($p) => $p['type'] === 'gocast-oauth' && $p['authenticated'] === true)
        ->assertCookie('token');

    expect(User::where('email', 'g@test.test')->exists())->toBeTrue();
    Notification::assertSentTo(User::where('email', 'g@test.test')->first(), WelcomeNotification::class);
});

it('renders the popup view with an error payload when Google auth throws', function () {
    [$state, $cookie] = oauthStateCookie();

    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('stateless')->andReturnSelf();
    $provider->shouldReceive('user')->andThrow(new RuntimeException('nope'));
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
        ->get('/api/auth/google/callback?state='.$state)
        ->assertSuccessful()
        ->assertViewIs('auth.google-callback')
        ->assertViewHas('payload', [
            'type' => 'gocast-oauth',
            'error' => 'google_auth_failed',
        ]);
});

it('marks the linked user as verified on first Google sign-in', function () {
    Notification::fake();
    $existing = User::factory()->unverified()->create(['email' => 'link@test.test']);
    [$state, $cookie] = oauthStateCookie();

    $google = fakeGoogleUser(id: 'g-777', email: 'link@test.test', name: 'Linker');
    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('stateless')->andReturnSelf();
    $provider->shouldReceive('user')->andReturn($google);
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
        ->get('/api/auth/google/callback?state='.$state)
        ->assertSuccessful();

    $fresh = $existing->fresh();
    expect($fresh->google_id)->toBe('g-777');
    expect($fresh->hasVerifiedEmail())->toBeTrue();
    Notification::assertSentTo($fresh, WelcomeNotification::class);
});

it('rejects callbacks with a missing or mismatched oauth state', function () {
    Socialite::shouldReceive('driver')->never();

    $this->withUnencryptedCookie('gocast_oauth_state', hash('sha256', 'real-state'))
        ->get('/api/auth/google/callback?state=forged-state')
        ->assertSuccessful()
        ->assertViewIs('auth.google-callback')
        ->assertViewHas('payload', [
            'type' => 'gocast-oauth',
            'error' => 'google_auth_failed',
        ]);
});

it('creates new Google users without an unknowable local password', function () {
    Notification::fake();
    [$state, $cookie] = oauthStateCookie();
    $google = fakeGoogleUser(id: 'g-999', email: 'new-google@test.test', name: 'New Google');

    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('stateless')->andReturnSelf();
    $provider->shouldReceive('user')->andReturn($google);
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
        ->get('/api/auth/google/callback?state='.$state)
        ->assertSuccessful();

    $user = User::where('email', 'new-google@test.test')->firstOrFail();
    expect($user->password)->toBeNull();
    expect($user->has_password)->toBeFalse();
    Notification::assertSentTo($user, WelcomeNotification::class);
});

it('does not send another welcome notification for an already verified Google user', function () {
    Notification::fake();
    $existing = User::factory()->create([
        'email' => 'verified-google@test.test',
        'google_id' => 'g-already',
    ]);
    [$state, $cookie] = oauthStateCookie();

    $google = fakeGoogleUser(id: 'g-already', email: 'verified-google@test.test', name: 'Verified Google');
    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('stateless')->andReturnSelf();
    $provider->shouldReceive('user')->andReturn($google);
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
        ->get('/api/auth/google/callback?state='.$state)
        ->assertSuccessful();

    Notification::assertNotSentTo($existing, WelcomeNotification::class);
});
