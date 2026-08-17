<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\Cache;
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

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
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

it('does not close the session of a broadcaster who has merely gone quiet', function () {
    // `source != live` is not proof the broadcaster left: the dead-air guard
    // demotes a silent-but-connected one to AutoDJ. Closing their session is
    // unrecoverable — harbor fires on_connect once, so nothing reopens it when
    // they speak again — and it costs them the idle reaper's protection
    // mid-show. So the reconciler waits out the full strike budget.
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
