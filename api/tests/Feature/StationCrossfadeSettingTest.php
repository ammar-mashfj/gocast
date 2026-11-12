<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\File;

use function Pest\Laravel\actingAs;

/**
 * The owner's crossfade switch rides on the station update endpoint. It only
 * shapes AutoDJ, so changing it is gated on the AutoDJ plan flag. It is
 * applied live, without a restart. proOwner() and freeOwner() live in
 * tests/Pest.php.
 */

/**
 * A supervisor with telnet left to the test, writing scripts to a scratch
 * directory: applyCrossfadeSetting rewrites the station's .liq as it pushes.
 */
function crossfadeSupervisor(): LiquidsoapSupervisor
{
    $dir = sys_get_temp_dir().'/gocast-liq-'.uniqid();
    config(['liquidsoap.liq_dir' => $dir]);
    test()->beforeApplicationDestroyed(fn () => File::deleteDirectory($dir));

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->__construct();

    return $supervisor;
}

it('defaults to on for a new station', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create()->fresh();

    expect($station->crossfade_enabled)->toBeTrue();
});

it('lets a pro owner turn crossfade off', function () {
    config(['liquidsoap.crossfade_enabled' => true]);
    $owner = proOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['crossfade_enabled' => false])
        ->assertOk()
        ->assertJsonPath('data.crossfade_enabled', false)
        ->assertJsonPath('data.crossfade_available', true);

    expect($station->fresh()->crossfade_enabled)->toBeFalse();
});

it('refuses the switch to an owner without autodj', function () {
    $owner = freeOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['crossfade_enabled' => false])
        ->assertForbidden()
        ->assertJsonPath('code', 'autodj_not_available');

    expect($station->fresh()->crossfade_enabled)->toBeTrue();
});

it('lets the rest of the form resend the unchanged value on any plan', function () {
    $owner = freeOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['crossfade_enabled' => true, 'genre' => 'Jazz'])
        ->assertOk();
});

it('reads a form-encoded unchanged value as unchanged', function () {
    // A multipart save (artwork upload) sends booleans as "1", which must not
    // count as a change and 403 the whole update.
    $owner = freeOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patch("/api/stations/{$station->slug}", ['crossfade_enabled' => '1', 'genre' => 'Jazz'], ['Accept' => 'application/json'])
        ->assertOk();
});

it('reports the live push as applied when liquidsoap confirms the set', function () {
    config(['liquidsoap.crossfade_enabled' => true]);
    $station = Station::factory()->for(User::factory(), 'user')->create(['crossfade_enabled' => false]);

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->once()
        ->with($station, 'var.set autodj_crossfade = false')
        ->andReturn("Variable autodj_crossfade set.\nEND\nBye!\n");

    expect($supervisor->applyCrossfadeSetting($station))->toBeTrue();
});

it('reports the live push as failed when the container has no such variable', function () {
    // A container started from an older script answers instead of dropping
    // the connection, so the reply has to be read to know the set failed.
    config(['liquidsoap.crossfade_enabled' => true]);
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->once()
        ->andReturn("Syntax error or variable not found.\nEND\nBye!\n");

    expect($supervisor->applyCrossfadeSetting($station))->toBeFalse();
});

it('reports the live push as failed when liquidsoap answers nothing', function () {
    // A wedged container can accept the connection and send no reply before
    // the read times out; that is not a confirmed set.
    config(['liquidsoap.crossfade_enabled' => true]);
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->once()->andReturn('');

    expect($supervisor->applyCrossfadeSetting($station))->toBeFalse();
});

it('rewrites the script on disk so a crash restart keeps the new value', function () {
    config(['liquidsoap.crossfade_enabled' => true]);
    $station = Station::factory()->for(User::factory(), 'user')->create(['crossfade_enabled' => false]);

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->andReturn("Variable autodj_crossfade set.\n");
    $supervisor->shouldNotReceive('restart');

    $supervisor->applyCrossfadeSetting($station);

    expect(file_get_contents(config('liquidsoap.liq_dir')."/{$station->slug}.liq"))
        ->toContain('interactive.bool("autodj_crossfade", false)');
});

/*
 * Per-station canary: LIQUIDSOAP_CROSSFADE_STATIONS turns crossfade on for
 * the listed slugs while the install-wide switch stays off. The other
 * stations' scripts must not change at all, or the reconciler recreates the
 * whole fleet.
 */

/** The script as the supervisor renders it, for the container or for the fingerprint. */
function crossfadeRender(Station $station, bool $fingerprint = false): string
{
    $supervisor = app(LiquidsoapSupervisor::class);

    return (new ReflectionMethod($supervisor, 'renderLiq'))->invoke($supervisor, $station, $fingerprint);
}

function canaryStation(string $slug): Station
{
    return Station::factory()->for(User::factory(), 'user')->create([
        'slug' => $slug,
        'desired_state' => Station::STATE_RUNNING,
    ]);
}

it('reads the canary list from env, trimming whitespace and empty entries', function () {
    $_SERVER['LIQUIDSOAP_CROSSFADE_STATIONS'] = ' gocast-official-station , ,other-station,';

    try {
        $config = require config_path('liquidsoap.php');
    } finally {
        unset($_SERVER['LIQUIDSOAP_CROSSFADE_STATIONS']);
    }

    expect($config['crossfade_stations'])->toBe(['gocast-official-station', 'other-station']);
});

it('reads an unset canary list as empty', function () {
    unset($_SERVER['LIQUIDSOAP_CROSSFADE_STATIONS'], $_ENV['LIQUIDSOAP_CROSSFADE_STATIONS']);
    putenv('LIQUIDSOAP_CROSSFADE_STATIONS');

    $config = require config_path('liquidsoap.php');

    expect($config['crossfade_stations'])->toBe([]);
});

it('gives crossfade to a canary station only', function () {
    config(['liquidsoap.crossfade_enabled' => false, 'liquidsoap.crossfade_stations' => ['canary']]);
    $canary = canaryStation('canary');
    $other = canaryStation('other');

    expect($canary->crossfadeAvailable())->toBeTrue()
        ->and($other->crossfadeAvailable())->toBeFalse();

    expect(crossfadeRender($canary))->toContain('def autodj_cross(')
        ->toContain('("X-Gocast-Lead", "5.000")');

    expect(crossfadeRender($other))->not->toContain('def autodj_cross(')
        ->not->toMatch('/^[^#\n]*\bcross\(/m')
        ->toContain('("X-Gocast-Lead", "0.000")');
});

it('still means every station when crossfade is on install-wide', function () {
    config(['liquidsoap.crossfade_enabled' => true, 'liquidsoap.crossfade_stations' => []]);
    $station = canaryStation('anyone');

    expect($station->crossfadeAvailable())->toBeTrue()
        ->and(crossfadeRender($station))->toContain('def autodj_cross(');
});

it('leaves a non-canary script byte for byte unchanged by the list', function () {
    // The reconciler recreates any station whose fingerprint render changes.
    // Listing other slugs, or slugs that match nothing, must not touch it.
    config(['liquidsoap.crossfade_enabled' => false, 'liquidsoap.crossfade_stations' => []]);
    $station = canaryStation('bystander');
    $script = crossfadeRender($station);
    $fingerprintScript = crossfadeRender($station, fingerprint: true);
    $fingerprint = app(LiquidsoapSupervisor::class)->configFingerprint($station);

    config(['liquidsoap.crossfade_stations' => ['someone-else', 'no-such-station']]);

    expect(crossfadeRender($station))->toBe($script)
        ->and(crossfadeRender($station, fingerprint: true))->toBe($fingerprintScript)
        ->and(app(LiquidsoapSupervisor::class)->configFingerprint($station))->toBe($fingerprint);
});

it('changes the fingerprint of the canary station when it is listed', function () {
    config(['liquidsoap.crossfade_enabled' => false, 'liquidsoap.crossfade_stations' => []]);
    $station = canaryStation('canary');
    $before = app(LiquidsoapSupervisor::class)->configFingerprint($station);

    config(['liquidsoap.crossfade_stations' => ['canary']]);

    expect(app(LiquidsoapSupervisor::class)->configFingerprint($station))->not->toBe($before);
});

it('reports crossfade as available to the dashboard for a canary station only', function () {
    config(['liquidsoap.crossfade_enabled' => false, 'liquidsoap.crossfade_stations' => ['canary']]);
    $owner = proOwner();
    $canary = Station::factory()->for($owner, 'user')->create(['slug' => 'canary']);
    $other = Station::factory()->for($owner, 'user')->create(['slug' => 'other']);

    actingAs($owner, 'sanctum')->getJson('/api/stations/canary')
        ->assertOk()->assertJsonPath('data.crossfade_available', true);

    actingAs($owner, 'sanctum')->getJson('/api/stations/other')
        ->assertOk()->assertJsonPath('data.crossfade_available', false);
});

it('pushes the owner switch live to a canary station', function () {
    config(['liquidsoap.crossfade_enabled' => false, 'liquidsoap.crossfade_stations' => ['canary']]);
    $station = canaryStation('canary');

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldReceive('telnet')->once()
        ->with(Mockery::on(fn ($s) => $s->is($station)), 'var.set autodj_crossfade = false')
        ->andReturn("Variable autodj_crossfade set.\n");
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $station->update(['crossfade_enabled' => false]);
});

it('pushes nothing to a station outside the canary list', function () {
    config(['liquidsoap.crossfade_enabled' => false, 'liquidsoap.crossfade_stations' => ['canary']]);
    $station = canaryStation('other');

    $supervisor = crossfadeSupervisor();
    $supervisor->shouldNotReceive('telnet');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $station->update(['crossfade_enabled' => false]);

    expect($supervisor->applyCrossfadeSetting($station))->toBeTrue();
});
