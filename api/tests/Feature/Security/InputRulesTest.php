<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Rules\NotDisposableEmail;
use App\Rules\OwnStorageUrl;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;

/*
| Input rules from the 2026-10-27 probe: station artwork must be a file we
| serve ourselves (the probe set it to a dnslog.cn callback), and sign-up
| refuses throwaway inboxes (the probe verified through maxxspace.com).
*/

it('accepts artwork on our own storage', function () {
    expect(OwnStorageUrl::passes(asset('storage/uploads/images/a.webp')))->toBeTrue();
});

it('refuses artwork that is not on our own storage', function (string $url) {
    expect(OwnStorageUrl::passes($url))->toBeFalse();
})->with([
    'callback host' => 'https://a2.squuqb.dnslog.cn/x.png',
    'other site' => 'https://example.com/storage/uploads/images/a.webp',
    'lookalike subdomain' => fn () => str_replace('://', '://evil.', asset('storage/a.webp')),
    'outside storage' => fn () => asset('index.php'),
    'path traversal' => fn () => asset('storage/../.env'),
    'encoded traversal' => fn () => asset('storage/%2e%2e/.env'),
    'credentials' => fn () => str_replace('://', '://user:pass@', asset('storage/a.webp')),
    'not http' => 'ftp://example.com/a.webp',
]);

it('refuses external artwork when a station is updated', function () {
    $station = Station::factory()->create();

    actingAs($station->user)
        ->patchJson("/api/stations/{$station->slug}", ['artwork_url' => 'https://a2.squuqb.dnslog.cn/x.png'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('artwork_url');

    actingAs($station->user)
        ->patchJson("/api/stations/{$station->slug}", ['artwork_url' => asset('storage/uploads/images/ok.webp')])
        ->assertSuccessful();

    expect($station->fresh()->artwork_url)->toBe(asset('storage/uploads/images/ok.webp'));
});

it('refuses external artwork when a station is created', function () {
    Plan::updateOrCreate(['id' => 1], ['name' => 'Free', 'slug' => 'free', 'max_stations' => 10, 'max_listeners' => 100]);
    $user = User::factory()->create(['plan_id' => 1]);

    actingAs($user)
        ->postJson('/api/stations', ['name' => 'Probe', 'artwork_url' => 'https://example.com/a.png'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('artwork_url');
});

it('lets a station clear its artwork', function () {
    $station = Station::factory()->create(['artwork_url' => asset('storage/uploads/images/a.webp')]);

    actingAs($station->user)
        ->patchJson("/api/stations/{$station->slug}", ['artwork_url' => null])
        ->assertSuccessful();

    expect($station->fresh()->artwork_url)->toBeNull();
});

it('spots throwaway domains and their subdomains', function (string $email, bool $disposable) {
    expect(NotDisposableEmail::isDisposable($email))->toBe($disposable);
})->with([
    ['qa1vwn6447ga@maxxspace.com', true],
    ['someone@MAILINATOR.com', true],
    ['someone@inbox.mailinator.com', true],
    ['someone@gmail.com', false],
    ['someone@example.com', false],
    ['someone@mailinatorfans.example', false],
]);

it('refuses sign-up with a throwaway address', function () {
    postJson('/api/auth/register', [
        'name' => 'Probe',
        'email' => 'qa1vwn6447ga@maxxspace.com',
        'password' => 'secret-pass-123',
        'password_confirmation' => 'secret-pass-123',
    ])->assertUnprocessable()->assertJsonValidationErrors('email');

    expect(User::query()->where('email', 'qa1vwn6447ga@maxxspace.com')->exists())->toBeFalse();
});

it('refuses changing to a throwaway address', function () {
    $user = User::factory()->create();

    actingAs($user)
        ->patchJson('/api/account/profile', ['email' => 'me@mailinator.com', 'current_password' => 'password'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('still lets an account already on a throwaway address save its name', function () {
    $user = User::factory()->create(['email' => 'old@mailinator.com']);

    actingAs($user)
        ->patchJson('/api/account/profile', ['name' => 'New name', 'email' => 'old@mailinator.com'])
        ->assertSuccessful();

    expect($user->fresh()->name)->toBe('New name');
});
