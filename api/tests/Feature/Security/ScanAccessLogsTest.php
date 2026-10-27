<?php

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/*
| security:scan-access-logs reads only what nginx appended since its last run
| and alerts per address on 4xx storms and 444s (direct-to-origin attempts).
*/

beforeEach(function () {
    config([
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);

    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);

    $this->dir = sys_get_temp_dir().'/gocast-access-logs-'.uniqid();
    mkdir($this->dir);
    $this->api = $this->dir.'/api.access.log';
    $this->stream = $this->dir.'/stream.access.log';
    touch($this->api);
    touch($this->stream);

    config([
        'security.access_logs.files' => [$this->api],
        'security.access_logs.blocked_files' => [$this->api, $this->stream],
        'security.access_logs.errors_per_ip' => 5,
        'security.access_logs.blocked_per_ip' => 3,
    ]);
});

afterEach(function () {
    array_map('unlink', glob($this->dir.'/*') ?: []);
    rmdir($this->dir);
});

function logLines(string $file, string $ip, int $status, int $count, string $path = '/api/stations/1/backup'): void
{
    $line = "{$ip} - - [27/Oct/2026:15:58:01 +0100] \"GET {$path} HTTP/1.1\" {$status} 162 \"-\" \"curl/8.5.0\"\n";
    file_put_contents($file, str_repeat($line, $count), FILE_APPEND);
}

/** @return list<string> */
function scanAlerts(): array
{
    return Http::recorded()
        ->map(fn (array $pair) => $pair[0])
        ->filter(fn (Request $r) => str_contains($r->url(), 'api.telegram.org'))
        ->map(fn (Request $r) => (string) $r['text'])
        ->values()
        ->all();
}

it('ignores what was in the log before its first run', function () {
    logLines($this->api, '134.122.193.110', 404, 50);

    $this->artisan('security:scan-access-logs')->assertSuccessful();

    expect(scanAlerts())->toBeEmpty();
});

it('alerts on an address piling up 4xx responses', function () {
    $this->artisan('security:scan-access-logs');

    logLines($this->api, '134.122.193.110', 404, 3);
    logLines($this->api, '134.122.193.110', 405, 2);
    logLines($this->api, '198.51.100.4', 404, 2);

    $this->artisan('security:scan-access-logs')->assertSuccessful();

    expect(scanAlerts())->toHaveCount(1)
        ->and(scanAlerts()[0])->toContain('Error storm')
        ->toContain('134.122.193.110')
        ->toContain('5 error responses');
});

it('does not count 401s, successes or the stream log as errors', function () {
    $this->artisan('security:scan-access-logs');

    logLines($this->api, '203.0.113.9', 401, 20);
    logLines($this->api, '203.0.113.9', 200, 20);
    logLines($this->stream, '203.0.113.9', 404, 20);

    $this->artisan('security:scan-access-logs');

    expect(scanAlerts())->toBeEmpty();
});

it('alerts on an address repeatedly refused for bypassing Cloudflare', function () {
    $this->artisan('security:scan-access-logs');

    logLines($this->api, '134.122.193.110', 444, 2, '/');
    logLines($this->stream, '134.122.193.110', 444, 1, '/');

    $this->artisan('security:scan-access-logs');

    expect(scanAlerts())->toHaveCount(1)
        ->and(scanAlerts()[0])->toContain('Direct-to-origin')
        ->toContain('3 connections refused');
});

it('reads only new lines on each run', function () {
    $this->artisan('security:scan-access-logs');

    logLines($this->api, '134.122.193.110', 404, 4);
    $this->artisan('security:scan-access-logs');
    logLines($this->api, '134.122.193.110', 404, 4);
    $this->artisan('security:scan-access-logs');

    // 4 + 4 in separate scans: neither reaches 5.
    expect(scanAlerts())->toBeEmpty();
});

it('starts over on a rotated log', function () {
    logLines($this->api, '198.51.100.4', 200, 100);
    $this->artisan('security:scan-access-logs');

    unlink($this->api);
    logLines($this->api, '134.122.193.110', 404, 6);

    $this->artisan('security:scan-access-logs');

    expect(scanAlerts())->toHaveCount(1);
});

it('skips a log it cannot read', function () {
    config(['security.access_logs.files' => ['/nonexistent/gocast.log']]);

    $this->artisan('security:scan-access-logs')->assertSuccessful();
});
