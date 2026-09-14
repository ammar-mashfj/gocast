<?php

use App\Models\Invite;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\InviteRedeemed;
use App\Notifications\WelcomeNotification;
use Illuminate\Support\Facades\Notification;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;

beforeEach(function () {
    config()->set('services.frontend_url', 'https://gocast.test');
});

function fakeGoogleUser(string $id = 'g-123', string $email = 'g@test.test', string $name = 'Google User', string $avatar = 'https://example.com/avatar.png'): SocialiteUser
{
    $u = new SocialiteUser;
    $u->id = $id;
    $u->email = $email;
    $u->name = $name;
    $u->avatar = $avatar;

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

describe('Google avatars too long for the column', function () {
    // Real lh3.googleusercontent.com/a-/ALV-Uj… URLs run past a kilobyte.
    // users.avatar_url was VARCHAR(255) until 2026_09_15_110000, and with
    // strict mode on MySQL rejects the value outright rather than truncating
    // it — an uncaught 1406 that killed the callback before it could set the
    // auth cookie, so the account was never created and the popup died on a
    // 500. These pin the guard: a picture must never cost someone an account.
    function googleAvatar(int $length): string
    {
        $prefix = 'https://lh3.googleusercontent.com/a-/';

        return $prefix.str_repeat('A', $length - strlen($prefix));
    }

    function mockGoogleUser(SocialiteUser $google): void
    {
        $provider = Mockery::mock(Provider::class);
        $provider->shouldReceive('stateless')->andReturnSelf();
        $provider->shouldReceive('user')->andReturn($google);
        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
    }

    it('stores a kilobyte-long avatar that still fits the column', function () {
        Notification::fake();
        [$state, $cookie] = oauthStateCookie();
        $avatar = googleAvatar(1200);
        mockGoogleUser(fakeGoogleUser(id: 'g-long', email: 'long@test.test', avatar: $avatar));

        $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
            ->get('/api/auth/google/callback?state='.$state)
            ->assertSuccessful()
            ->assertCookie('token');

        expect(User::where('email', 'long@test.test')->firstOrFail()->avatar_url)->toBe($avatar);
    });

    it('creates the account anyway when the avatar overflows the column', function () {
        Notification::fake();
        [$state, $cookie] = oauthStateCookie();
        mockGoogleUser(fakeGoogleUser(id: 'g-huge', email: 'huge@test.test', avatar: googleAvatar(3000)));

        $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
            ->get('/api/auth/google/callback?state='.$state)
            ->assertSuccessful()
            ->assertViewHas('payload', fn ($p) => $p['authenticated'] === true)
            ->assertCookie('token');

        // Null, not truncated: a clipped URL would be stored happily and then
        // render as a broken image forever.
        expect(User::where('email', 'huge@test.test')->firstOrFail()->avatar_url)->toBeNull();
    });

    it('links an existing password account without choking on the avatar', function () {
        Notification::fake();
        $existing = User::factory()->unverified()->create([
            'email' => 'link-huge@test.test',
            'avatar_url' => null,
        ]);
        [$state, $cookie] = oauthStateCookie();
        mockGoogleUser(fakeGoogleUser(id: 'g-link-huge', email: 'link-huge@test.test', avatar: googleAvatar(3000)));

        $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
            ->get('/api/auth/google/callback?state='.$state)
            ->assertSuccessful()
            ->assertCookie('token');

        $fresh = $existing->fresh();

        expect($fresh->google_id)->toBe('g-link-huge')
            ->and($fresh->avatar_url)->toBeNull();
    });
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

describe('signing up through Google with an invite', function () {
    function mockGoogle(SocialiteUser $google): void
    {
        $provider = Mockery::mock(Provider::class);
        $provider->shouldReceive('stateless')->andReturnSelf();
        $provider->shouldReceive('user')->andReturn($google);
        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
    }

    it('parks a well-formed invite code in a cookie for the round trip', function () {
        $this->get('/api/auth/google?invite=DJ-Dana-GoCast-Pro')
            ->assertRedirect()
            ->assertCookie('gocast_oauth_invite', 'DJ-Dana-GoCast-Pro', encrypted: false);
    });

    it('drops a code that does not look like one', function () {
        $this->get('/api/auth/google?invite=<script>')
            ->assertRedirect()
            ->assertCookieMissing('gocast_oauth_invite');
    });

    it('applies the invite and sends exactly one welcome, the Pro one', function () {
        Notification::fake();
        $invite = Invite::factory()->create(['duration_days' => 30]);
        [$state, $cookie] = oauthStateCookie();
        mockGoogle(fakeGoogleUser(id: 'g-inv', email: 'invited@test.test'));

        $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
            ->withUnencryptedCookie('gocast_oauth_invite', $invite->code)
            ->get('/api/auth/google/callback?state='.$state)
            ->assertSuccessful()
            ->assertViewHas('payload', fn ($p) => $p['authenticated'] === true
                && $p['invite']['applied'] === true
                && $p['invite']['plan'] === 'Pro')
            ->assertCookieExpired('gocast_oauth_invite');

        $user = User::where('email', 'invited@test.test')->firstOrFail();

        expect($user->plan->slug)->toBe('pro')
            ->and($user->invite_id)->toBe($invite->id)
            ->and($user->plan_expires_at)->not->toBeNull()
            ->and($invite->fresh()->uses)->toBe(1);

        Notification::assertSentToTimes($user, InviteRedeemed::class, 1);
        Notification::assertNotSentTo($user, WelcomeNotification::class);
    });

    it('still creates the account when the link is dead, and says why', function () {
        Notification::fake();
        $invite = Invite::factory()->used()->create();
        [$state, $cookie] = oauthStateCookie();
        mockGoogle(fakeGoogleUser(id: 'g-late', email: 'late@test.test'));

        $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
            ->withUnencryptedCookie('gocast_oauth_invite', $invite->code)
            ->get('/api/auth/google/callback?state='.$state)
            ->assertSuccessful()
            ->assertViewHas('payload', fn ($p) => $p['authenticated'] === true
                && $p['invite']['applied'] === false
                && $p['invite']['message'] === 'This invite has already been used.');

        $user = User::where('email', 'late@test.test')->firstOrFail();

        expect($user->plan->slug)->toBe('free')
            ->and($user->invite_id)->toBeNull();

        Notification::assertSentTo($user, WelcomeNotification::class);
        Notification::assertNotSentTo($user, InviteRedeemed::class);
    });

    it('does not turn an existing paid account into a trial', function () {
        Notification::fake();
        $pro = Plan::where('slug', 'pro')->firstOrFail();
        $existing = User::factory()->create(['email' => 'perma@test.test', 'plan_id' => $pro->id]);
        $invite = Invite::factory()->create(['duration_days' => 30]);
        [$state, $cookie] = oauthStateCookie();
        mockGoogle(fakeGoogleUser(id: 'g-perma', email: 'perma@test.test'));

        $this->withUnencryptedCookie('gocast_oauth_state', $cookie)
            ->withUnencryptedCookie('gocast_oauth_invite', $invite->code)
            ->get('/api/auth/google/callback?state='.$state)
            ->assertSuccessful()
            ->assertViewHas('payload', fn ($p) => $p['invite']['applied'] === false);

        $fresh = $existing->fresh();

        expect($fresh->plan_id)->toBe($pro->id)
            ->and($fresh->plan_expires_at)->toBeNull()
            ->and($fresh->invite_id)->toBeNull()
            ->and($invite->fresh()->uses)->toBe(0);

        Notification::assertNothingSent();
    });
});
