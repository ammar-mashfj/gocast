<?php

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/*
| security:check-cloudflare-ranges compares the installed nginx file with
| Cloudflare's published ranges and only ever alerts.
*/

beforeEach(function () {
    config([
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
        'security.cloudflare_realip_conf' => base_path('../infra/native/nginx/cloudflare-realip.conf'),
    ]);
});

/**
 * @return array{0: string, 1: string}
 */
function publishedFromRepoFile(): array
{
    $conf = (string) file_get_contents(base_path('../infra/native/nginx/cloudflare-realip.conf'));
    preg_match_all('/^set_real_ip_from\s+(\S+);/m', $conf, $m);

    $v4 = array_filter($m[1], fn ($r) => ! str_contains($r, ':'));
    $v6 = array_filter($m[1], fn ($r) => str_contains($r, ':'));

    return [implode("\n", $v4)."\n", implode("\n", $v6)."\n"];
}

function fakeCloudflare(string $v4, string $v6): void
{
    Http::fake([
        'www.cloudflare.com/ips-v4' => Http::response($v4),
        'www.cloudflare.com/ips-v6' => Http::response($v6),
        'api.telegram.org/*' => Http::response(['ok' => true]),
    ]);
}

/** @return list<string> */
function rangeAlerts(): array
{
    return Http::recorded()
        ->map(fn (array $pair) => $pair[0])
        ->filter(fn (Request $r) => str_contains($r->url(), 'api.telegram.org'))
        ->map(fn (Request $r) => (string) $r['text'])
        ->values()
        ->all();
}

it('keeps the two lists in the repo file identical', function () {
    $conf = (string) file_get_contents(base_path('../infra/native/nginx/cloudflare-realip.conf'));

    preg_match_all('/^set_real_ip_from\s+(\S+);/m', $conf, $realIp);
    preg_match_all('/^\s+([0-9a-f:.]+\/\d+)\s+1;/m', $conf, $geo);

    $geo = array_values(array_diff($geo[1], ['127.0.0.1/32', '::1/128']));

    expect($geo)->toEqualCanonicalizing($realIp[1]);
});

it('stays quiet when the installed ranges match', function () {
    fakeCloudflare(...publishedFromRepoFile());

    $this->artisan('security:check-cloudflare-ranges')
        ->expectsOutputToContain('match the published lists')
        ->assertSuccessful();

    expect(rangeAlerts())->toBeEmpty();
});

it('alerts when Cloudflare publishes a range nginx lacks', function () {
    [$v4, $v6] = publishedFromRepoFile();
    fakeCloudflare($v4."192.0.2.0/24\n", $v6);

    $this->artisan('security:check-cloudflare-ranges')->assertSuccessful();

    expect(rangeAlerts())->toHaveCount(1)
        ->and(rangeAlerts()[0])->toContain('Missing')->toContain('192.0.2.0/24');
});

it('alerts when nginx keeps a range Cloudflare dropped', function () {
    [$v4, $v6] = publishedFromRepoFile();
    fakeCloudflare(str_replace("131.0.72.0/22\n", '', $v4), $v6);

    $this->artisan('security:check-cloudflare-ranges');

    expect(rangeAlerts())->toHaveCount(1)
        ->and(rangeAlerts()[0])->toContain('No longer published')->toContain('131.0.72.0/22');
});

it('does not compare against an empty or failed response', function () {
    fakeCloudflare('', '');

    $this->artisan('security:check-cloudflare-ranges')->assertSuccessful();

    Http::fake([
        'www.cloudflare.com/*' => Http::response('down', 503),
        'api.telegram.org/*' => Http::response(['ok' => true]),
    ]);

    $this->artisan('security:check-cloudflare-ranges')->assertSuccessful();

    expect(rangeAlerts())->toBeEmpty();
});

it('does nothing where the file is not installed', function () {
    config(['security.cloudflare_realip_conf' => '/nonexistent/cloudflare-realip.conf']);
    Http::fake();

    $this->artisan('security:check-cloudflare-ranges')->assertSuccessful();

    Http::assertNothingSent();
});
