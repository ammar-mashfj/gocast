<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;

/**
 * Every docker-touching method short-circuits in tests (see the test-mode
 * guard note in api/CLAUDE.md), so these tests exercise the COMMAND
 * CONSTRUCTION rather than the daemon. That is where the regressions live: a
 * missing `--stop-timeout` or a malformed health probe fails silently in
 * production and looks fine everywhere else.
 *
 * The daemon-side behaviour these commands produce was verified separately
 * against the real image — a graceful stop drains in ~0.5s and exits 0, and a
 * container started with these flags transitions starting → unhealthy →
 * healthy as its Icecast connection comes up.
 */
function invokePrivate(object $object, string $method, array $args = []): mixed
{
    $reflection = new ReflectionMethod($object, $method);

    return $reflection->invokeArgs($object, $args);
}

function runCommandFor(Station $station): array
{
    $supervisor = app(LiquidsoapSupervisor::class);

    return array_merge(
        invokePrivate($supervisor, 'baseRunCommand', [$station]),
        invokePrivate($supervisor, 'sandboxFlags'),
        invokePrivate($supervisor, 'healthFlags'),
        invokePrivate($supervisor, 'resourceFlags'),
        invokePrivate($supervisor, 'mountFlags', [$station]),
    );
}

beforeEach(function () {
    $this->station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'flag-check']);
});

it('gives the container a stop signal and grace period', function () {
    // Without these, a `docker stop` from anywhere other than our own teardown
    // path — a host shutdown, an operator by hand — falls back to Docker's
    // 10s default and then SIGKILLs, losing the HLS persist state.
    $cmd = runCommandFor($this->station);

    expect($cmd)->toContain('--stop-signal')
        ->and($cmd)->toContain('SIGTERM')
        ->and($cmd)->toContain('--stop-timeout');
});

it('drops every capability and blocks privilege escalation', function () {
    $cmd = runCommandFor($this->station);

    expect($cmd)->toContain('--cap-drop')
        ->and($cmd)->toContain('ALL')
        ->and($cmd)->toContain('--security-opt')
        ->and($cmd)->toContain('no-new-privileges')
        ->and($cmd)->toContain('--pids-limit');
});

it('labels the container with the station it belongs to', function () {
    // The reconciler recovers a slug by parsing the container name, which is
    // the one thing a rename changes; labels survive it.
    $cmd = runCommandFor($this->station);

    expect($cmd)->toContain('gocast.station=flag-check')
        ->and($cmd)->toContain('gocast.station_id='.$this->station->id);
});

it('builds a health probe that needs no tools the image lacks', function () {
    // The image has no curl, wget or nc — only bash. A probe that assumes
    // otherwise marks every station unhealthy, and the reconciler then
    // recreates all of them.
    $cmd = runCommandFor($this->station);
    $probe = $cmd[array_search('--health-cmd', $cmd, true) + 1];

    expect($probe)->toContain('/dev/tcp/127.0.0.1/8080')
        ->and($probe)->toContain('/healthz')
        ->and($probe)->toContain(' 200 ')
        ->and($probe)->not->toContain('curl')
        ->and($probe)->not->toContain('wget');
});

it('gives a cold boot a grace period before failures count', function () {
    // A station takes seconds to build its audio graph and connect to Icecast.
    // Without a start period it is marked unhealthy while still coming up.
    $cmd = runCommandFor($this->station);

    expect($cmd)->toContain('--health-start-period');

    $startPeriod = $cmd[array_search('--health-start-period', $cmd, true) + 1];
    expect((int) $startPeriod)->toBeGreaterThanOrEqual(30);
});

it('omits health flags entirely when the healthcheck is disabled', function () {
    config(['liquidsoap.health_enabled' => false]);

    expect(invokePrivate(app(LiquidsoapSupervisor::class), 'healthFlags'))->toBe([]);
});

it('takes the image from config so a bad upgrade is rolled back without a deploy', function () {
    config(['liquidsoap.image' => 'gocast/liquidsoap:v2.4.2']);

    expect(runCommandFor($this->station))->toContain('gocast/liquidsoap:v2.4.2');
});

it('never lets the stop timeout exceed the docker process timeout', function () {
    // A stop timeout above Laravel's own Process timeout means the CLI is
    // killed mid-shutdown — the exact SIGKILL the graceful stop exists to
    // avoid, reintroduced by a config typo.
    config(['liquidsoap.stop_timeout_seconds' => 300]);

    $cmd = runCommandFor($this->station);
    $timeout = (int) $cmd[array_search('--stop-timeout', $cmd, true) + 1];

    expect($timeout)->toBeLessThan(10)
        ->and(invokePrivate(app(LiquidsoapSupervisor::class), 'stopTimeout'))->toBeLessThan(10);
});

it('keeps a stop timeout of at least one second', function () {
    config(['liquidsoap.stop_timeout_seconds' => 0]);

    expect(invokePrivate(app(LiquidsoapSupervisor::class), 'stopTimeout'))->toBe(1);
});

it('mounts the station script read-only and the hls directory writable', function () {
    $cmd = runCommandFor($this->station);
    $mounts = array_values(array_filter($cmd, fn ($a) => str_contains((string) $a, ':/')));

    expect(implode(' ', $mounts))
        ->toContain('/station.liq:ro')
        ->toContain('/data/playlists:ro')
        ->toContain('/data/hls');
});
