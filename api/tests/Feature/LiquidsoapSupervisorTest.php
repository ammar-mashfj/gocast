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
    config(['liquidsoap.image' => 'gocast/liquidsoap:v2.4.5']);

    expect(runCommandFor($this->station))->toContain('gocast/liquidsoap:v2.4.5');
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

it('sets jingle settings over telnet in liquidsoap var syntax', function () {
    // Liquidsoap's `var.set` is typed: a float variable refuses "1800", and a
    // bool refuses "1". Both failures are answered on a socket nobody reads,
    // so the setting silently never applies and the only symptom is a station
    // that ignores its own settings until it happens to restart.
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'slug' => 'night-shift',
        'jingles_enabled' => true,
        'jingle_interval_seconds' => 900,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with($station, 'var.set jingles_enabled = true')
        ->andReturn('Variable jingles_enabled set.');
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with($station, 'var.set jingle_by_tracks = false')
        ->andReturn('Variable jingle_by_tracks set.');
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with($station, 'var.set jingle_interval = 900.0')
        ->andReturn('Variable jingle_interval set.');
    // Int variable, so no decimal point — the mirror image of the float above.
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with($station, 'var.set jingle_every_tracks = 5')
        ->andReturn('Variable jingle_every_tracks set.');

    expect($supervisor->applyJingleSettings($station))->toBeTrue();
});

it('pushes both modes settings, not only the active one', function () {
    // They are independent variables in the script. Sending only the mode in
    // use would leave the other stale, so switching modes back would briefly
    // apply whatever was last written until the next save.
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_interval_seconds' => 600,
        'jingle_every_tracks' => 8,
    ]);

    $sent = [];
    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')
        ->times(4)
        ->andReturnUsing(function ($_station, $command) use (&$sent) {
            $sent[] = $command;

            return '';
        });

    $supervisor->applyJingleSettings($station);

    expect($sent)->toBe([
        'var.set jingles_enabled = true',
        'var.set jingle_by_tracks = true',
        'var.set jingle_interval = 600.0',
        'var.set jingle_every_tracks = 8',
    ]);
});

it('sends false rather than omitting the switch when jingles are turned off', function () {
    // Turning jingles OFF is a change that has to travel too. Skipping the
    // command would leave a running container happily playing station IDs the
    // owner just disabled.
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'jingles_enabled' => false,
        'jingle_interval_seconds' => 1800,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with($station, 'var.set jingles_enabled = false')
        ->andReturn('');
    $supervisor->shouldReceive('telnet')->times(3)->andReturn('');

    expect($supervisor->applyJingleSettings($station))->toBeTrue();
});

it('reports failure without throwing when the container cannot be reached', function () {
    // Best-effort, like the playlist reload: the values are also rendered into
    // the script as its initial state, so an unreachable container picks them
    // up on its next start. A failed push must never fail the HTTP request
    // that saved the setting.
    $station = Station::factory()->for(User::factory(), 'user')->make();

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')->once()->andThrow(new RuntimeException('connect failed'));

    expect($supervisor->applyJingleSettings($station))->toBeFalse();
});

it('never sends an interval that would fire a jingle between every track', function () {
    // The request layer enforces a 60s minimum, but a row edited by hand or by
    // a seeder must not be able to reach delay() as 0 — that makes the jingle
    // source permanently ready, so every single track boundary plays one.
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'jingles_enabled' => true,
        'jingle_interval_seconds' => 0,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')->once()->with($station, 'var.set jingle_interval = 60.0');
    $supervisor->shouldReceive('telnet')->times(3)->andReturn('');

    $supervisor->applyJingleSettings($station);
});

it('never sends a track count that would satisfy the counter permanently', function () {
    // The count gate is `tracks_since_jingle() >= N`. At N=0 that is true the
    // instant a jingle ends, so every boundary would play one.
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 0,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')->once()->with($station, 'var.set jingle_every_tracks = 1');
    $supervisor->shouldReceive('telnet')->times(3)->andReturn('');

    $supervisor->applyJingleSettings($station);
});
