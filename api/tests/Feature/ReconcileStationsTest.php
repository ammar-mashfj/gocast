<?php

use App\Events\StationStateChanged;
use App\Models\Station;
use App\Models\User;
use App\Services\AdminTelegram;
use App\Services\IcecastAdmin;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;

/**
 * The reconciler converges Docker onto `desired_state`. Every test here
 * mocks the supervisor so nothing touches a real daemon — see the test-mode
 * guard note in api/CLAUDE.md.
 */
/**
 * @param  list<string>|array<string, array{status: string, health: string}>  $containers
 *                                                                                         Either a list of container names (assumed running and healthy) or a
 *                                                                                         map of name => state for tests that care about the difference.
 */
function fakeSupervisor(array $containers): LiquidsoapSupervisor
{
    $states = array_is_list($containers)
        ? array_fill_keys($containers, ['status' => 'running', 'health' => LiquidsoapSupervisor::HEALTH_HEALTHY])
        : $containers;

    // Every container is on the current config unless a test says otherwise.
    $states = array_map(fn (array $state) => $state + ['config' => 'current'], $states);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('configFingerprint')->andReturn('current')->byDefault();
    $supervisor->shouldReceive('listContainerStates')->andReturn($states);
    $supervisor->shouldReceive('listManagedContainers')->andReturn(array_keys($states));

    return $supervisor;
}

it('removes containers whose station rows are gone', function () {
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'live-one',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([
        LiquidsoapSupervisor::CONTAINER_PREFIX.'live-one',
        LiquidsoapSupervisor::CONTAINER_PREFIX.'truly-gone',
    ]);
    $supervisor->shouldReceive('removeContainer')
        ->once()
        ->with(LiquidsoapSupervisor::CONTAINER_PREFIX.'truly-gone');
    $supervisor->shouldReceive('isRunning')->andReturn(true);

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('1 orphan')
        ->expectsOutputToContain('truly-gone')
        ->assertExitCode(0);
});

it('removes the container of a station its owner has stopped', function () {
    // This is what makes the power button durable: `--restart unless-stopped`
    // would otherwise bring a stopped station back after a host reboot.
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'taken-off-air',
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $supervisor = fakeSupervisor([LiquidsoapSupervisor::CONTAINER_PREFIX.'taken-off-air']);
    $supervisor->shouldReceive('removeContainer')
        ->once()
        ->with(LiquidsoapSupervisor::CONTAINER_PREFIX.'taken-off-air');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('unwanted')
        ->assertExitCode(0);
});

it('removes the container of a soft-deleted station', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'soft-deleted',
        'desired_state' => Station::STATE_RUNNING,
    ]);
    $station->delete();

    $supervisor = fakeSupervisor([LiquidsoapSupervisor::CONTAINER_PREFIX.'soft-deleted']);
    $supervisor->shouldReceive('removeContainer')
        ->once()
        ->with(LiquidsoapSupervisor::CONTAINER_PREFIX.'soft-deleted');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')->assertExitCode(0);
});

it('starts a station that should be running but has no container', function () {
    // The other half of convergence: StationLifecycleService records intent
    // before touching Docker precisely so a failed start is retried here.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'should-be-up',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([]);
    $supervisor->shouldReceive('up')
        ->once()
        ->withArgs(fn (Station $s) => $s->is($station));

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('1 missing')
        ->expectsOutputToContain('started should-be-up')
        ->assertExitCode(0);
});

it('does nothing when containers match intent', function () {
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'kept',
        'desired_state' => Station::STATE_RUNNING,
    ]);
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'off-air',
        'desired_state' => Station::STATE_STOPPED,
    ]);

    $supervisor = fakeSupervisor([LiquidsoapSupervisor::CONTAINER_PREFIX.'kept']);
    $supervisor->shouldNotReceive('removeContainer');
    $supervisor->shouldNotReceive('up');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('Nothing to do')
        ->assertExitCode(0);
});

it('reports drift without changing anything in dry-run mode', function () {
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'wants-up',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([LiquidsoapSupervisor::CONTAINER_PREFIX.'orphan']);
    $supervisor->shouldNotReceive('removeContainer');
    $supervisor->shouldNotReceive('up');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile', ['--dry-run' => true])
        ->expectsOutputToContain('dry run')
        ->expectsOutputToContain('remove '.LiquidsoapSupervisor::CONTAINER_PREFIX.'orphan')
        ->expectsOutputToContain('start wants-up')
        ->assertExitCode(0);
});

it('ignores containers that do not match the gocast naming convention', function () {
    $supervisor = fakeSupervisor(['some-other-app', 'postgres']);
    $supervisor->shouldNotReceive('removeContainer');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')->assertExitCode(0);
});

/**
 * The drift class that did not exist: a container that is PRESENT but not
 * working. `docker ps -a` lists a crash-looping container, so it was neither
 * missing nor unwanted, and nothing ever touched it — a station with a broken
 * script restarted forever while the dashboard showed "starting".
 */
function unhealthyContainer(string $slug, string $status = 'restarting'): array
{
    return [
        LiquidsoapSupervisor::CONTAINER_PREFIX.$slug => [
            'status' => $status,
            'health' => LiquidsoapSupervisor::HEALTH_NONE,
        ],
    ];
}

it('does not recreate an unhealthy container on the first pass', function () {
    // A station legitimately booting can look unhealthy for a moment. Drift is
    // only drift once it persists.
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'wobbly',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor(unhealthyContainer('wobbly'));
    $supervisor->shouldNotReceive('removeContainer');
    $supervisor->shouldNotReceive('up');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('1 unhealthy')
        ->expectsOutputToContain('pass 1/2')
        ->assertExitCode(0);
});

it('recreates a container that has been unhealthy across consecutive passes', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'wedged',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor(unhealthyContainer('wedged'));
    $supervisor->shouldReceive('removeContainer')
        ->once()
        ->with(LiquidsoapSupervisor::CONTAINER_PREFIX.'wedged');
    $supervisor->shouldReceive('up')
        ->once()
        ->withArgs(fn (Station $s) => $s->is($station));

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')->assertExitCode(0);
    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('recreated wedged')
        ->assertExitCode(0);
});

it('treats a failing healthcheck as unhealthy even while the container runs', function () {
    // The container is up and Docker is happy to call it running; its own
    // /healthz says it is not carrying audio to anyone.
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'silent-but-up',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([
        LiquidsoapSupervisor::CONTAINER_PREFIX.'silent-but-up' => [
            'status' => 'running',
            'health' => LiquidsoapSupervisor::HEALTH_UNHEALTHY,
        ],
    ]);

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('1 unhealthy')
        ->assertExitCode(0);
});

it('does not treat a container inside its health grace period as unhealthy', function () {
    // `health: starting` is the start-period a cold boot is entitled to.
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'booting',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([
        LiquidsoapSupervisor::CONTAINER_PREFIX.'booting' => [
            'status' => 'running',
            'health' => LiquidsoapSupervisor::HEALTH_STARTING,
        ],
    ]);
    $supervisor->shouldNotReceive('removeContainer');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('Nothing to do')
        ->assertExitCode(0);
});

it('stops recreating a station that has burned its hourly budget', function () {
    // A genuinely broken script must not turn the reconciler into a second
    // restart loop on top of Docker's own.
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'hopeless',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    config(['liquidsoap.unhealthy_passes_before_recreate' => 1]);
    Cache::put('station-recreates:hopeless', 3, now()->addHour());

    $supervisor = fakeSupervisor(unhealthyContainer('hopeless'));
    $supervisor->shouldNotReceive('removeContainer');
    $supervisor->shouldNotReceive('up');

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('already recreated')
        ->assertExitCode(1);
});

it('waits out the strike budget when the container cannot say who is attached', function () {
    // A container too old to report `broadcaster` leaves only `source`, which
    // describes which arm feeds the encoder rather than who is connected. So
    // the reconciler spends its whole budget before acting: closing a live
    // session is unrecoverable — harbor fires on_connect once, so nothing
    // reopens it — and it costs the broadcaster the idle reaper's protection
    // mid-show.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'quiet-dj',
        'desired_state' => Station::STATE_RUNNING,
    ]);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    $supervisor = fakeSupervisor(['gocast-liquidsoap-quiet-dj']);
    $supervisor->shouldReceive('containerHost')->andReturn('quiet-dj-host');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(['ready' => true, 'icecast' => true, 'source' => 'autodj'], 200)]);

    $limit = (int) config('liquidsoap.stranded_session_strikes');
    expect($limit)->toBeGreaterThan(2);

    // One short of the budget: still open, because they may just be quiet.
    foreach (range(1, $limit - 1) as $pass) {
        $this->artisan('stations:reconcile')->run();
        Cache::forget('station-status:'.$station->id);
    }

    expect($station->streamSessions()->whereNull('ended_at')->exists())->toBeTrue();

    // Budget spent — now it is treated as stranded and closed.
    $this->artisan('stations:reconcile')->run();

    expect($station->streamSessions()->whereNull('ended_at')->exists())->toBeFalse();
});

it('leaves an attached broadcaster alone however long the arm says autodj', function () {
    // The case the strike budget used to exist for, now answered outright:
    // `broadcaster` says a source client is connected, whatever arm is
    // currently feeding the encoder. No amount of passes may close it.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'attached-dj',
        'desired_state' => Station::STATE_RUNNING,
    ]);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    $supervisor = fakeSupervisor(['gocast-liquidsoap-attached-dj']);
    $supervisor->shouldReceive('containerHost')->andReturn('attached-dj-host');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(
        ['ready' => true, 'icecast' => true, 'source' => 'autodj', 'broadcaster' => true],
        200,
    )]);

    foreach (range(1, (int) config('liquidsoap.stranded_session_strikes') + 2) as $pass) {
        $this->artisan('stations:reconcile')->run();
        Cache::forget('station-status:'.$station->id);
    }

    expect($station->streamSessions()->whereNull('ended_at')->exists())->toBeTrue();
});

it('leaves an open session alone while the container still reports live', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'on-mic',
        'desired_state' => Station::STATE_RUNNING,
    ]);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    $supervisor = fakeSupervisor(['gocast-liquidsoap-on-mic']);
    $supervisor->shouldReceive('containerHost')->andReturn('on-mic-host');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(['ready' => true, 'icecast' => true, 'source' => 'live'], 200)]);

    foreach (range(1, (int) config('liquidsoap.stranded_session_strikes') + 2) as $pass) {
        $this->artisan('stations:reconcile')->run();
        Cache::forget('station-status:'.$station->id);
    }

    expect($station->streamSessions()->whereNull('ended_at')->exists())->toBeTrue();
});

it('tells an open dashboard when it brings a dead station back', function () {
    // The reconciler is the ONLY producer for a container that died: `docker
    // kill`, an OOM and a host reboot all fire nothing, and the absence of an
    // event is not an event. Without this the owner's dashboard finds out on
    // its next reconcile poll instead of when the recovery starts.
    Event::fake([StationStateChanged::class]);

    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'vanished',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([]);
    $supervisor->shouldReceive('up')->once()->withArgs(fn (Station $s) => $s->is($station));

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('started vanished')
        ->assertExitCode(0);

    Event::assertDispatched(
        StationStateChanged::class,
        fn (StationStateChanged $e) => $e->slug === 'vanished' && $e->event === 'reconciled',
    );
});

it('tells an open dashboard when it recreates a wedged station', function () {
    Event::fake([StationStateChanged::class]);

    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'crash-looping',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor(unhealthyContainer('crash-looping'));
    $supervisor->shouldReceive('removeContainer')->once();
    $supervisor->shouldReceive('up')->once()->withArgs(fn (Station $s) => $s->is($station));

    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    // Drift has to persist across two passes before the reconciler acts, so a
    // station that merely looks unhealthy while booting is left alone.
    $this->artisan('stations:reconcile')->assertExitCode(0);
    Event::assertNotDispatched(StationStateChanged::class);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('recreated crash-looping')
        ->assertExitCode(0);

    Event::assertDispatched(
        StationStateChanged::class,
        fn (StationStateChanged $e) => $e->slug === 'crash-looping' && $e->event === 'reconciled',
    );
});

it('recreates a station started on an older config once nobody is broadcasting', function () {
    // A deploy changed the template, image or docker flags: the container's
    // label no longer matches what a fresh start would get.
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'stale-idle',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([
        'gocast-liquidsoap-stale-idle' => ['status' => 'running', 'health' => 'healthy', 'config' => 'old'],
    ]);
    $supervisor->shouldReceive('containerHost')->andReturn('stale-idle-host');
    $supervisor->shouldReceive('up')->once()->with(Mockery::on(fn ($s) => $s->is($station)));
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(['ready' => true, 'source' => 'autodj', 'broadcaster' => false], 200)]);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('1 outdated')
        ->expectsOutputToContain('recreated stale-idle (outdated)')
        ->assertExitCode(0);
});

it('judges no station outdated when the image cannot be inspected', function () {
    // A daemon timeout on `docker image inspect` would otherwise change every
    // station's fingerprint at once and restart all the idle ones.
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'blind-pass',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([
        'gocast-liquidsoap-blind-pass' => ['status' => 'running', 'health' => 'healthy', 'config' => 'current'],
    ]);
    $supervisor->shouldReceive('configFingerprint')->andReturn(null);
    $supervisor->shouldNotReceive('up');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile')
        ->doesntExpectOutputToContain('outdated')
        ->assertExitCode(0);
});

it('leaves an outdated station alone while its broadcast session is open', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'stale-live',
        'desired_state' => Station::STATE_RUNNING,
    ]);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    $supervisor = fakeSupervisor([
        'gocast-liquidsoap-stale-live' => ['status' => 'running', 'health' => 'healthy', 'config' => 'old'],
    ]);
    $supervisor->shouldReceive('containerHost')->andReturn('stale-live-host');
    $supervisor->shouldNotReceive('up');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(['ready' => true, 'source' => 'live', 'broadcaster' => true], 200)]);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('stale-live outdated, waiting for the broadcast to end')
        ->assertExitCode(0);
});

it('leaves an outdated station alone while the container reports a broadcaster', function () {
    // No session yet: harbor's live_connected callback can trail the connect.
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'stale-joining',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([
        'gocast-liquidsoap-stale-joining' => ['status' => 'running', 'health' => 'healthy', 'config' => 'old'],
    ]);
    $supervisor->shouldReceive('containerHost')->andReturn('stale-joining-host');
    $supervisor->shouldNotReceive('up');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(['ready' => true, 'source' => 'autodj', 'broadcaster' => true], 200)]);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('waiting for the broadcast to end')
        ->assertExitCode(0);
});

it('leaves an outdated station alone when its container cannot be asked', function () {
    Station::factory()->for(User::factory(), 'user')->create([
        'slug' => 'stale-mute',
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = fakeSupervisor([
        'gocast-liquidsoap-stale-mute' => ['status' => 'running', 'health' => 'healthy', 'config' => 'old'],
    ]);
    $supervisor->shouldReceive('containerHost')->andReturn('stale-mute-host');
    $supervisor->shouldNotReceive('up');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response('', 500)]);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('waiting for the broadcast to end')
        ->assertExitCode(0);
});

it('stops recreating outdated stations after one fails', function () {
    // A broken template must cost one idle station, not walk the fleet.
    foreach (['stale-a', 'stale-b'] as $slug) {
        Station::factory()->for(User::factory(), 'user')->create([
            'slug' => $slug,
            'desired_state' => Station::STATE_RUNNING,
        ]);
    }

    $supervisor = fakeSupervisor([
        'gocast-liquidsoap-stale-a' => ['status' => 'running', 'health' => 'healthy', 'config' => 'old'],
        'gocast-liquidsoap-stale-b' => ['status' => 'running', 'health' => 'healthy', 'config' => 'old'],
    ]);
    $supervisor->shouldReceive('containerHost')->andReturn('stale-host');
    $supervisor->shouldReceive('up')->once()->andThrow(new RuntimeException('script failed to parse'));
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(['ready' => true, 'source' => 'autodj', 'broadcaster' => false], 200)]);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('halting outdated recreates')
        ->assertExitCode(1);

    // Next pass: still halted, nothing touched.
    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('left alone')
        ->assertExitCode(1);
});

it('spreads outdated recreates across passes', function () {
    config(['liquidsoap.outdated_recreates_per_pass' => 1]);

    $states = [];
    foreach (['stale-x', 'stale-y'] as $slug) {
        Station::factory()->for(User::factory(), 'user')->create([
            'slug' => $slug,
            'desired_state' => Station::STATE_RUNNING,
        ]);
        $states["gocast-liquidsoap-{$slug}"] = ['status' => 'running', 'health' => 'healthy', 'config' => 'old'];
    }

    $supervisor = fakeSupervisor($states);
    $supervisor->shouldReceive('containerHost')->andReturn('stale-host');
    $supervisor->shouldReceive('up')->once();
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    Http::fake(['*/status' => Http::response(['ready' => true, 'source' => 'autodj', 'broadcaster' => false], 200)]);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('next pass (per-pass limit reached)')
        ->assertExitCode(0);
});

/**
 * @return array<string, array{status: string, health: string}>
 */
function failingHealthchecks(array $slugs): array
{
    $states = [];
    foreach ($slugs as $slug) {
        $states[LiquidsoapSupervisor::CONTAINER_PREFIX.$slug] = [
            'status' => 'running',
            'health' => LiquidsoapSupervisor::HEALTH_UNHEALTHY,
        ];
    }

    return $states;
}

function runningStations(array $slugs): void
{
    foreach ($slugs as $slug) {
        Station::factory()->for(User::factory(), 'user')->create([
            'slug' => $slug,
            'desired_state' => Station::STATE_RUNNING,
        ]);
    }
}

/**
 * A supervisor that accepts any recreate and records which stations it got.
 *
 * @param  array<string, array{status: string, health: string}>  $states
 */
function recordingSupervisor(array $states, ArrayObject $recreated): LiquidsoapSupervisor
{
    $supervisor = fakeSupervisor($states);
    $supervisor->shouldReceive('removeContainer')->andReturnUsing(function (string $name) use ($recreated) {
        $recreated[] = str_replace(LiquidsoapSupervisor::CONTAINER_PREFIX, '', $name);
    });
    $supervisor->shouldReceive('up')->andReturnNull();

    return $supervisor;
}

/**
 * Icecast answering with no sources: a shared cause that is not Icecast
 * being down, so the throttle (not the full hold) applies.
 */
function icecastAnswering(): void
{
    $icecast = Mockery::mock(IcecastAdmin::class)->makePartial();
    $icecast->shouldReceive('liveMounts')->andReturn([]);
    app()->instance(IcecastAdmin::class, $icecast);
}

function silentTelegram(): AdminTelegram
{
    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldReceive('opsAlert')->byDefault();

    return $telegram;
}

it('alerts the admin when it recreates an unhealthy station', function () {
    // A frozen clock fails /healthz, Docker marks the container unhealthy and
    // this recreates it. unity-radio was silent 6h45m with nothing raised;
    // a recreate must never be silent again.
    runningStations(['frozen-clock']);

    $supervisor = fakeSupervisor(failingHealthchecks(['frozen-clock']));
    $supervisor->shouldReceive('removeContainer')->once();
    $supervisor->shouldReceive('up')->once();
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldReceive('opsAlert')
        ->once()
        ->withArgs(fn (string $key, string $html) => str_starts_with($key, 'stations-recreated:') && str_contains($html, 'frozen-clock'));
    $this->app->instance(AdminTelegram::class, $telegram);

    $this->artisan('stations:reconcile')->assertExitCode(0);
    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('recreated frozen-clock')
        ->assertExitCode(0);
});

it('sends one alert for many recreates in the same pass', function () {
    // A fleet-wide crash loop (a bad image) is one message, not one per station.
    runningStations(['crash-a', 'crash-b', 'crash-c']);

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(
        unhealthyContainer('crash-a', 'exited') + unhealthyContainer('crash-b', 'exited') + unhealthyContainer('crash-c', 'exited'),
        $recreated,
    ));

    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldReceive('opsAlert')
        ->once()
        ->withArgs(fn (string $key, string $html) => str_starts_with($key, 'stations-recreated:')
            && str_contains($html, 'Recreated 3')
            && str_contains($html, 'crash-a') && str_contains($html, 'crash-c'));
    $this->app->instance(AdminTelegram::class, $telegram);

    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');

    expect($recreated->getArrayCopy())->toEqualCanonicalizing(['crash-a', 'crash-b', 'crash-c']);
});

it('throttles recreates to the per-pass limit when many running stations fail their healthcheck at once', function () {
    icecastAnswering();
    // A hung Icecast stalls every station's clock on its socket writes, so
    // they all fail /healthz together. Recreating the fleet at once cannot
    // fix that; one a pass still recovers a real mass freeze.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c']);

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $recreated));

    $telegram = silentTelegram();
    // Once: on the first pass none is due a recreate yet, so a blip that
    // short is not an event.
    $telegram->shouldReceive('opsAlert')
        ->once()
        ->withArgs(fn (string $key, string $html) => $key === 'stations-unhealthy-shared' && str_contains($html, '3 stations'));
    $this->app->instance(AdminTelegram::class, $telegram);

    $this->artisan('stations:reconcile')->assertExitCode(0);
    expect($recreated)->toHaveCount(0);

    $this->artisan('stations:reconcile')
        ->expectsOutputToContain('likely a shared cause')
        ->expectsOutputToContain('waiting, shared-cause throttle')
        ->assertExitCode(0);
    expect($recreated)->toHaveCount(1);
});

it('keeps throttling for a while after the shared cause clears', function () {
    icecastAnswering();
    // When the cause clears, the stations still catching up must not all be
    // recreated in the first pass the count dips under the limit.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c']);
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $recreated));
    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');
    expect($recreated)->toHaveCount(1);

    // Two still failing: under the limit, but the throttle is still on.
    $stillFailing = array_values(array_diff(['ice-a', 'ice-b', 'ice-c'], $recreated->getArrayCopy()));
    $after = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks($stillFailing), $after));
    $this->artisan('stations:reconcile');

    expect($after)->toHaveCount(1);
});

it('never throttles crashed containers', function () {
    icecastAnswering();
    // The throttle is for running containers failing /healthz. A container
    // that exited needs a restart however many others are struggling.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c', 'crashed']);
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(
        failingHealthchecks(['ice-a', 'ice-b', 'ice-c']) + unhealthyContainer('crashed', 'exited'),
        $recreated,
    ));

    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile')->expectsOutputToContain('recreated crashed');

    expect($recreated->getArrayCopy())->toContain('crashed')->toHaveCount(2);
});

it('does not count crashed containers towards a shared cause', function () {
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['one', 'two', 'crashed']);

    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldNotReceive('opsAlert')->with('stations-unhealthy-shared', Mockery::any(), Mockery::any());
    $telegram->shouldReceive('opsAlert')->withArgs(fn (string $key) => str_starts_with($key, 'stations-recreated:'))->once();
    $this->app->instance(AdminTelegram::class, $telegram);

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(
        failingHealthchecks(['one', 'two']) + unhealthyContainer('crashed', 'exited'),
        $recreated,
    ));

    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');

    expect($recreated->getArrayCopy())->toEqualCanonicalizing(['one', 'two', 'crashed']);
});

it('does not let stations past their recreate budget throttle the rest of the fleet', function () {
    // Three stations are broken for good and already recreated to the cap;
    // two more freeze on their own. Both are recreated in the same pass.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['broken-a', 'broken-b', 'broken-c', 'fresh-a', 'fresh-b']);
    foreach (['broken-a', 'broken-b', 'broken-c'] as $slug) {
        Cache::put('station-recreates:'.$slug, 3, now()->addHour());
    }
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(
        failingHealthchecks(['broken-a', 'broken-b', 'broken-c', 'fresh-a', 'fresh-b']),
        $recreated,
    ));

    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');

    expect($recreated->getArrayCopy())->toEqualCanonicalizing(['fresh-a', 'fresh-b']);
});

it('alerts the admin when a station is still unhealthy after its recreate budget', function () {
    runningStations(['hopeless']);
    Cache::put('station-recreates:hopeless', 3, now()->addHour());

    $supervisor = fakeSupervisor(failingHealthchecks(['hopeless']));
    $supervisor->shouldNotReceive('removeContainer');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldReceive('opsAlert')
        ->once()
        ->withArgs(fn (string $key, string $html) => str_starts_with($key, 'stations-recreate-budget:') && str_contains($html, 'hopeless'));
    $this->app->instance(AdminTelegram::class, $telegram);

    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile')->expectsOutputToContain('leaving it');
});

it('changes nothing and sends no alerts on a dry run', function () {
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 1, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['dry-a', 'dry-b', 'dry-c']);
    Cache::put('station-recreates:dry-c', 3, now()->addHour());
    Cache::put('station-unhealthy-passes:dry-c', 5, now()->addHour());
    // dry-a and dry-b already failed one pass, so this one makes them due.
    Cache::put('station-unhealthy-passes:dry-a', 1, now()->addHour());
    Cache::put('station-unhealthy-passes:dry-b', 1, now()->addHour());

    $supervisor = fakeSupervisor(failingHealthchecks(['dry-a', 'dry-b', 'dry-c']));
    $supervisor->shouldNotReceive('removeContainer');
    $supervisor->shouldNotReceive('up');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldNotReceive('opsAlert');
    $this->app->instance(AdminTelegram::class, $telegram);

    $this->artisan('stations:reconcile --dry-run')
        ->expectsOutputToContain('likely a shared cause')
        ->expectsOutputToContain('dry-c unhealthy and already recreated 3x');

    expect(Cache::get('station-unhealthy-passes:dry-a'))->toBe(1)
        ->and(Cache::get('station-unhealthy-passes:dry-c'))->toBe(5)
        ->and(Cache::has('stations-unhealthy-shared-cause'))->toBeFalse();
});

it('takes turns under the throttle instead of recreating the same station again', function () {
    icecastAnswering();
    // docker ps lists the newest container first. Without ordering, a station
    // just recreated (and failing again) would win the one slot every pass
    // while the one frozen all along waits.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c']);
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $recreated));

    // Pass 1 counts, then one recreate per pass; the recreated one keeps
    // failing (same states every pass) and goes to the back of the line.
    foreach (range(1, 4) as $pass) {
        $this->artisan('stations:reconcile');
    }

    expect($recreated->getArrayCopy())->toHaveCount(3)
        ->and(array_unique($recreated->getArrayCopy()))->toHaveCount(3);
});

it('stops throttling once the shared cause has been gone a few minutes', function () {
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c']);
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $recreated));
    $this->artisan('stations:reconcile');

    $this->travel(4)->minutes();

    // Two fail on their own, well after the event: both are recreated.
    $after = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b']), $after));
    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');

    expect($after->getArrayCopy())->toEqualCanonicalizing(['ice-a', 'ice-b']);
});

it('sends one recreate alert key for the whole throttled event', function () {
    icecastAnswering();
    // Each throttled pass recreates a different station; a per-set key would
    // message every minute for the length of the event.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c']);

    $keys = new ArrayObject;
    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldReceive('opsAlert')->andReturnUsing(function (string $key) use ($keys) {
        $keys[] = $key;
    });
    $this->app->instance(AdminTelegram::class, $telegram);

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $recreated));
    foreach (range(1, 4) as $pass) {
        $this->artisan('stations:reconcile');
    }

    $recreateKeys = array_values(array_unique(array_filter($keys->getArrayCopy(), fn (string $k) => str_starts_with($k, 'stations-recreated'))));
    expect($recreateKeys)->toBe(['stations-recreated:throttled']);
});

it('lets the dry run show the throttle', function () {
    icecastAnswering();
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 1, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['dry-a', 'dry-b']);
    Cache::put('station-unhealthy-passes:dry-a', 3, now()->addHour());
    Cache::put('station-unhealthy-passes:dry-b', 3, now()->addHour());
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $supervisor = fakeSupervisor(failingHealthchecks(['dry-a', 'dry-b']));
    $supervisor->shouldNotReceive('removeContainer');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    $this->artisan('stations:reconcile --dry-run')
        ->expectsOutputToContain('• recreate dry-')
        ->expectsOutputToContain('waiting, shared-cause throttle');
});

it('does not call a one-pass fleet-wide blip a shared cause', function () {
    // Every station fails one probe round together (an NTP step, a short
    // Icecast hiccup) and recovers: nothing is due a recreate, so no alert
    // and no throttle.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['blip-a', 'blip-b', 'blip-c']);

    $telegram = Mockery::mock(AdminTelegram::class);
    $telegram->shouldNotReceive('opsAlert');
    $this->app->instance(AdminTelegram::class, $telegram);

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['blip-a', 'blip-b', 'blip-c']), $recreated));
    $this->artisan('stations:reconcile');

    expect(Cache::has('stations-unhealthy-shared-cause'))->toBeFalse()
        ->and($recreated)->toHaveCount(0);
});

it('holds every healthcheck recreate while icecast itself is not answering', function () {
    // The shared cause is Icecast: a recreate cannot help, and would only drop
    // the station's live broadcaster and spend its hourly budget.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c', 'crashed']);

    $icecast = Mockery::mock(IcecastAdmin::class)->makePartial();
    $icecast->shouldReceive('liveMounts')->andReturnNull();
    $this->app->instance(IcecastAdmin::class, $icecast);

    $telegram = silentTelegram();
    $telegram->shouldReceive('opsAlert')
        ->atLeast()->once()
        ->withArgs(fn (string $key, string $html) => $key === 'stations-unhealthy-shared' && str_contains($html, 'Icecast is not answering'));
    $this->app->instance(AdminTelegram::class, $telegram);

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(
        failingHealthchecks(['ice-a', 'ice-b', 'ice-c']) + unhealthyContainer('crashed', 'exited'),
        $recreated,
    ));

    foreach (range(1, 3) as $pass) {
        $this->artisan('stations:reconcile');
    }

    // The crashed container is still restarted; none of the stalled ones are.
    expect($recreated->getArrayCopy())->toBe(['crashed']);
});

it('falls back to the throttle when icecast has not answered for ten minutes', function () {
    // The admin API can fail for its own reasons (a rotated password) while
    // the stations are frozen for real. A hold must not become forever.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c']);
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $icecast = Mockery::mock(IcecastAdmin::class)->makePartial();
    $icecast->shouldReceive('liveMounts')->andReturnNull();
    $this->app->instance(IcecastAdmin::class, $icecast);

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $recreated));

    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');
    expect($recreated)->toHaveCount(0);

    $this->travel(11)->minutes();
    $this->artisan('stations:reconcile')->expectsOutputToContain('recreating at most 1 per pass');

    expect($recreated)->toHaveCount(1);
});

it('does not restart the icecast hold for every event while the admin api stays broken', function () {
    // A rotated admin password makes every mount-list call fail, forever. The
    // first event is held for ten minutes; a later one must not be held again.
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2, 'liquidsoap.unhealthy_recreates_per_pass_when_shared' => 1]);
    runningStations(['ice-a', 'ice-b', 'ice-c']);
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $icecast = Mockery::mock(IcecastAdmin::class)->makePartial();
    $icecast->shouldReceive('liveMounts')->andReturnNull();
    $this->app->instance(IcecastAdmin::class, $icecast);

    $first = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $first));
    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');
    expect($first)->toHaveCount(0);

    // All healthy for a while: the event is over, the admin API still broken.
    $this->travel(15)->minutes();
    $this->app->instance(LiquidsoapSupervisor::class, fakeSupervisor([
        LiquidsoapSupervisor::CONTAINER_PREFIX.'ice-a',
        LiquidsoapSupervisor::CONTAINER_PREFIX.'ice-b',
        LiquidsoapSupervisor::CONTAINER_PREFIX.'ice-c',
    ]));
    $this->artisan('stations:reconcile');
    $this->travel(5)->minutes();

    // A new event: throttled straight away, not held for another ten minutes.
    $second = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['ice-a', 'ice-b', 'ice-c']), $second));
    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');

    expect($second)->toHaveCount(1);
});

it('throttles to three recreates per pass by default', function () {
    config(['liquidsoap.unhealthy_shared_cause_threshold' => 2]);
    runningStations(['m-a', 'm-b', 'm-c', 'm-d', 'm-e']);
    icecastAnswering();
    $this->app->instance(AdminTelegram::class, silentTelegram());

    $recreated = new ArrayObject;
    $this->app->instance(LiquidsoapSupervisor::class, recordingSupervisor(failingHealthchecks(['m-a', 'm-b', 'm-c', 'm-d', 'm-e']), $recreated));
    $this->artisan('stations:reconcile');
    $this->artisan('stations:reconcile');

    expect($recreated)->toHaveCount(3);
});
