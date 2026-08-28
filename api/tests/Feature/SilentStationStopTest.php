<?php

use App\Jobs\StopSilentStation;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\SilentStationPolicy;
use App\Services\StationLifecycleException;
use App\Services\StationLifecycleService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;

/**
 * A station with no AutoDJ rotation has only the silence bed to play once its
 * broadcaster disconnects, so it comes off air in a minute rather than the
 * hours `stations:reap-idle` allows.
 *
 * The rule lives in SilentStationPolicy and is applied from two places — a
 * delayed job on the harbor disconnect event, and a scheduled sweep — so most
 * of what matters here is that both agree, and that everything which could
 * change inside the window (a reconnect, an upload, a manual stop) is re-read
 * rather than assumed.
 */
beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-silent-test-'.uniqid();
    config([
        'liquidsoap.playlists_dir' => $this->tmpDir,
        'liquidsoap.silent_stop_seconds' => 60,
        'services.internal_api_key' => 'test-internal-key',
    ]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

function silentStation(): Station
{
    return Station::factory()
        ->for(User::factory(), 'user')
        ->create(['desired_state' => Station::STATE_RUNNING]);
}

/** A stream session that started and ended $secondsAgo seconds ago. */
function endedSession(Station $station, int $secondsAgo): void
{
    $station->streamSessions()->create([
        'started_at' => now()->subSeconds($secondsAgo + 600),
        'ended_at' => now()->subSeconds($secondsAgo),
        'source_type' => 'browser',
    ]);
}

// ── The policy ──

it('stops a station whose broadcaster has been gone longer than the window', function () {
    $station = silentStation();
    endedSession($station, 90);

    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeTrue();
});

it('leaves a station alone inside the window', function () {
    // 30s into a 60s window — this is the reconnect case, and the container
    // must survive it.
    $station = silentStation();
    endedSession($station, 30);

    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeFalse();
});

it('never stops a station that has an AutoDJ rotation', function () {
    // The whole point of the feature: a station with tracks has real audio to
    // play between broadcasts, and stopping it would interrupt it.
    $station = silentStation();
    endedSession($station, 3600);
    Track::factory()->for($station)->create(['kind' => Track::KIND_MUSIC]);

    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeFalse();
});

it('treats a jingle-only library as no rotation', function () {
    // Jingles are punctuation played between rotation tracks. A station whose
    // entire library is jingles has nothing to punctuate.
    $station = silentStation();
    endedSession($station, 3600);
    Track::factory()->for($station)->create(['kind' => Track::KIND_JINGLE]);

    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeTrue();
});

it('never stops a station that is still live', function () {
    // An open session is what "live" means. The broadcaster reconnected.
    $station = silentStation();
    endedSession($station, 3600);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    expect(app(SilentStationPolicy::class)->shouldStop($station->fresh()))->toBeFalse();
});

it('never stops a station that has never had a broadcaster', function () {
    // Deliberate: pressing the power button and going live a few minutes later
    // must not have the station switch itself off mid-setup. Those are
    // idle_stop_hours' problem.
    $station = silentStation();

    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeFalse();
    expect(app(SilentStationPolicy::class)->silentSince($station))->toBeNull();
});

it('never stops a station that is already off air', function () {
    $station = silentStation();
    $station->update(['desired_state' => Station::STATE_STOPPED]);
    endedSession($station, 3600);

    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeFalse();
});

it('is disabled entirely when the window is zero', function () {
    config(['liquidsoap.silent_stop_seconds' => 0]);
    $station = silentStation();
    endedSession($station, 86400);

    expect(app(SilentStationPolicy::class)->enabled())->toBeFalse();
    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeFalse();
});

it('measures from the most recent session, not the first', function () {
    // A station broadcast to twice is silent since the SECOND one ended.
    $station = silentStation();
    endedSession($station, 7200);
    endedSession($station, 10);

    expect(app(SilentStationPolicy::class)->shouldStop($station))->toBeFalse();
});

// ── The event → job wiring ──

it('queues a delayed stop when harbor reports the broadcaster gone', function () {
    Queue::fake();
    $station = silentStation();
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    test()->postJson('/api/internal/station-event', [
        'slug' => $station->slug,
        'event' => 'live_disconnected',
    ], ['X-Internal-Key' => 'test-internal-key'])->assertOk();

    Queue::assertPushed(StopSilentStation::class, fn ($job) => $job->stationId === $station->id);
});

it('does not queue a stop for a station with a rotation', function () {
    Queue::fake();
    $station = silentStation();
    Track::factory()->for($station)->create(['kind' => Track::KIND_MUSIC]);

    test()->postJson('/api/internal/station-event', [
        'slug' => $station->slug,
        'event' => 'live_disconnected',
    ], ['X-Internal-Key' => 'test-internal-key'])->assertOk();

    Queue::assertNotPushed(StopSilentStation::class);
});

it('does not queue a stop when the feature is disabled', function () {
    Queue::fake();
    config(['liquidsoap.silent_stop_seconds' => 0]);
    $station = silentStation();

    test()->postJson('/api/internal/station-event', [
        'slug' => $station->slug,
        'event' => 'live_disconnected',
    ], ['X-Internal-Key' => 'test-internal-key'])->assertOk();

    Queue::assertNotPushed(StopSilentStation::class);
});

// ── The job ──

it('stops the station when the job runs and the policy still agrees', function () {
    $station = silentStation();
    endedSession($station, 90);

    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldReceive('stop')->once()->with(Mockery::on(
        fn (Station $s) => $s->id === $station->id
    ));

    (new StopSilentStation($station->id))->handle(app(SilentStationPolicy::class), $lifecycle);
});

it('does nothing when the broadcaster reconnected inside the window', function () {
    // The job is a reminder to look, never a decision already taken.
    $station = silentStation();
    endedSession($station, 90);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldNotReceive('stop');

    (new StopSilentStation($station->id))->handle(app(SilentStationPolicy::class), $lifecycle);
});

it('does nothing when the station was deleted while the job was queued', function () {
    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldNotReceive('stop');

    $job = new StopSilentStation('01JQZZZZZZZZZZZZZZZZZZZZZZ');

    expect(fn () => $job->handle(app(SilentStationPolicy::class), $lifecycle))
        ->not->toThrow(Throwable::class);
});

it('swallows a lifecycle refusal when someone goes live in the race window', function () {
    // stop() is called with force: false precisely so this can happen. Losing
    // the stop is free; cutting off a live broadcaster is not.
    $station = silentStation();
    endedSession($station, 90);

    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldReceive('stop')->once()->andThrow(StationLifecycleException::liveBroadcast());

    $job = new StopSilentStation($station->id);

    expect(fn () => $job->handle(app(SilentStationPolicy::class), $lifecycle))
        ->not->toThrow(Throwable::class);

    expect($station->fresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

// ── The scheduled backstop ──

it('reaps a silent station on the scheduled sweep', function () {
    // The path that has to work when the container never reached the API, or
    // the queue was down for the whole window.
    $station = silentStation();
    endedSession($station, 120);

    $this->artisan('stations:reap-silent')
        ->expectsOutputToContain('stopped '.$station->slug)
        ->assertSuccessful();

    expect($station->fresh()->desired_state)->toBe(Station::STATE_STOPPED);
});

it('leaves stations with a rotation out of the sweep entirely', function () {
    $station = silentStation();
    endedSession($station, 120);
    Track::factory()->for($station)->create(['kind' => Track::KIND_MUSIC]);

    $this->artisan('stations:reap-silent')->assertSuccessful();

    expect($station->fresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('reports without stopping on a dry run', function () {
    $station = silentStation();
    endedSession($station, 120);

    $this->artisan('stations:reap-silent --dry-run')
        ->expectsOutputToContain('would stop '.$station->slug)
        ->assertSuccessful();

    expect($station->fresh()->desired_state)->toBe(Station::STATE_RUNNING);
});

it('short-circuits the sweep when the feature is disabled', function () {
    config(['liquidsoap.silent_stop_seconds' => 0]);
    $station = silentStation();
    endedSession($station, 86400);

    $this->artisan('stations:reap-silent')->assertSuccessful();

    expect($station->fresh()->desired_state)->toBe(Station::STATE_RUNNING);
});
