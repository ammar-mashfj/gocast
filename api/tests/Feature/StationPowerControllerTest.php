<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistFileWriter;
use Illuminate\Support\Facades\File;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;
use function Pest\Laravel\postJson;

beforeEach(function () {
    // Starting a station writes an empty playlist.m3u; keep it out of
    // /var/gocast.
    $this->tmpDir = sys_get_temp_dir().'/gocast-power-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

function proUser(): User
{
    return User::factory()->create([
        'plan_id' => Plan::query()->where('slug', 'pro')->value('id'),
    ]);
}

it('creates a station off air', function () {
    // The whole point of the power button: a new station is a configuration,
    // not a running process.
    $user = proUser();

    $response = actingAs($user)
        ->postJson('/api/stations', ['name' => 'Night Shift'])
        ->assertCreated();

    expect($response->json('data.desired_state'))->toBe(Station::STATE_STOPPED)
        ->and($response->json('data.state'))->toBe('offline')
        ->and($response->json('data.is_on_air'))->toBeFalse();
});

it('starts a station and records when it went on air', function () {
    $user = proUser();
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/start")
        ->assertStatus(202)
        ->assertJsonPath('data.desired_state', Station::STATE_RUNNING);

    $station->refresh();

    expect($station->desired_state)->toBe(Station::STATE_RUNNING)
        ->and($station->started_at)->not->toBeNull();
});

it('writes an empty playlist when a station starts so Liquidsoap has a file to read', function () {
    $user = proUser();
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)->postJson("/api/stations/{$station->slug}/start")->assertStatus(202);

    expect(file_exists($this->tmpDir.'/'.$station->slug.'/'.PlaylistFileWriter::FILENAME))->toBeTrue();
});

it('stops a station and clears its start time', function () {
    $user = proUser();
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
        'started_at' => now()->subHour(),
    ]);

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/stop")
        ->assertOk()
        ->assertJsonPath('data.desired_state', Station::STATE_STOPPED);

    $station->refresh();

    expect($station->desired_state)->toBe(Station::STATE_STOPPED)
        ->and($station->started_at)->toBeNull();
});

it('refuses to stop a station that is on air', function () {
    // Killing the container mid-broadcast drops every listener and ends the
    // session by crash rather than through the not-ready hook.
    $user = proUser();
    $station = Station::factory()->for($user, 'user')->live()->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/stop")
        ->assertStatus(409)
        ->assertJsonPath('code', 'station_is_live');

    expect($station->refresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('refuses to start more stations than the plan allows', function () {
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['max_running_stations' => 1]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    Station::factory()->for($user, 'user')->create(['desired_state' => Station::STATE_RUNNING]);
    $second = Station::factory()->for($user, 'user')->create();

    actingAs($user)
        ->postJson("/api/stations/{$second->slug}/start")
        ->assertStatus(422)
        ->assertJsonPath('code', 'station_limit_reached');

    expect($second->refresh()->desired_state)->toBe(Station::STATE_STOPPED);
});

it('counts only the requesting user towards the concurrency limit', function () {
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['max_running_stations' => 1]);

    // Somebody else's running station must not consume our slot.
    Station::factory()->for(User::factory()->create(['plan_id' => $plan->id]), 'user')
        ->create(['desired_state' => Station::STATE_RUNNING]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/start")
        ->assertStatus(202);
});

it('lets a station already at the limit be restarted without consuming a second slot', function () {
    // Re-pressing start on a running station must not trip its own limit.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['max_running_stations' => 1]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/start")
        ->assertStatus(202);
});

it('forbids controlling a station you do not own', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();
    $stranger = proUser();

    actingAs($stranger)->postJson("/api/stations/{$station->slug}/start")->assertForbidden();
    actingAs($stranger)->postJson("/api/stations/{$station->slug}/stop")->assertForbidden();
    actingAs($stranger)->postJson("/api/stations/{$station->slug}/skip")->assertForbidden();
    actingAs($stranger)->getJson("/api/stations/{$station->slug}/status")->assertForbidden();
});

it('rejects unauthenticated power actions', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    postJson("/api/stations/{$station->slug}/start")->assertUnauthorized();
    postJson("/api/stations/{$station->slug}/stop")->assertUnauthorized();
    getJson("/api/stations/{$station->slug}/status")->assertUnauthorized();
});

it('refuses to skip on a station that is off air', function () {
    $user = proUser();
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/skip")
        ->assertStatus(409)
        ->assertJsonPath('code', 'station_not_running');
});

it('sends a skip command to a running station', function () {
    $user = proUser();
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')
        ->once()
        ->withArgs(fn (Station $s, string $command) => $s->is($station)
            && $command === PlaylistFileWriter::LIQ_SOURCE.'.skip')
        ->andReturn('');
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/skip")
        ->assertOk();
});

it('reports a station that cannot be reached rather than pretending the skip worked', function () {
    $user = proUser();
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')->andThrow(new RuntimeException('connection refused'));
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/skip")
        ->assertStatus(503)
        ->assertJsonPath('code', 'station_unreachable');
});
