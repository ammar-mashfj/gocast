<?php

use App\Enums\StationAudioVerdict;
use App\Jobs\StopStation;
use App\Models\Plan;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\StationAudioPolicy;
use App\Services\StationLifecycleException;
use App\Services\StationLifecycleService;
use App\Services\StationStatusService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/**
 * A station comes off air when it has no audio to broadcast and nothing
 * attached that could produce any — never because nobody is listening.
 *
 * Replaces SilentStationStopTest and ReapIdleStationsTest, whose subjects were
 * merged into one decision tree. Every case they covered is carried over here;
 * the cases they could NOT express, because neither command could see the
 * difference, are the ones grouped under "the seam" below.
 *
 * StationAudioPolicy::verdict() is pure — it takes the container's answer as an
 * argument — so the table is exercised without HTTP or a queue. Only the
 * command and job tests fake either.
 */
beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-sweep-test-'.uniqid();
    config([
        'liquidsoap.playlists_dir' => $this->tmpDir,
        'liquidsoap.silent_stop_seconds' => 60,
        'liquidsoap.silence_rms_threshold' => 0.0001,
        'services.internal_api_key' => 'test-internal-key',
    ]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

function sweptStation(bool $autoDj = false): Station
{
    $plan = Plan::factory()->create(['autodj_enabled' => $autoDj]);

    return Station::factory()
        ->for(User::factory()->for($plan), 'user')
        ->create(['desired_state' => Station::STATE_RUNNING]);
}

/**
 * A container status payload. Defaults describe the case that matters most —
 * ready, reachable, nobody attached, emitting nothing.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function status(array $overrides = []): array
{
    return array_merge([
        'ready' => true,
        'icecast' => true,
        'source' => 'silence',
        'broadcaster' => false,
        'rms' => 0.0,
    ], $overrides);
}

function verdictFor(Station $station, ?array $status): StationAudioVerdict
{
    return app(StationAudioPolicy::class)->verdict($station, $status);
}

/** Put the station's silence clock $secondsAgo seconds in the past. */
function silentFor(Station $station, int $secondsAgo): Station
{
    $station->forceFill(['silent_since' => now()->subSeconds($secondsAgo)])->save();

    return $station;
}

// ── The seam: cases neither predecessor could see ──

it('never stops a broadcaster who has merely gone quiet', function () {
    // THE case the old design got wrong. blank.strip demotes a muted mic, so
    // the container reports `autodj` while the socket is wide open — and
    // "went quiet for 15s" was indistinguishable from "hung up".
    $station = silentFor(sweptStation(), 3600);

    expect(verdictFor($station, status(['broadcaster' => true, 'source' => 'autodj', 'rms' => 0.0])))
        ->toBe(StationAudioVerdict::InUse);
});

it('reports a rotation that is playing nothing instead of stopping it', function () {
    // A paying customer whose station reads as on air and transmits silence.
    // Stopping it would swap a visible fault for an invisible one.
    $station = silentFor(sweptStation(autoDj: true), 3600);
    Track::factory()->for($station)->create(['kind' => Track::KIND_MUSIC]);

    expect(verdictFor($station, status(['source' => 'autodj', 'rms' => 0.0])))
        ->toBe(StationAudioVerdict::Fault);
});

it('stops a downgraded station whose library it may no longer play', function () {
    // Tracks survive a downgrade; the entitlement does not. The container is
    // correctly playing nothing, so this is an idle station, not a fault —
    // calling it a fault would hold the container open forever.
    $station = silentFor(sweptStation(autoDj: false), 3600);
    Track::factory()->for($station)->create(['kind' => Track::KIND_MUSIC]);

    expect(verdictFor($station, status()))->toBe(StationAudioVerdict::Stop);
});

// ── Audio presence, not audience ──

it('never stops a station that is producing sound', function () {
    // An AutoDJ rotation playing to an empty room is the paid feature working.
    $station = silentFor(sweptStation(autoDj: true), 86400);

    expect(verdictFor($station, status(['source' => 'autodj', 'rms' => 0.6])))
        ->toBe(StationAudioVerdict::InUse);
});

it('treats a level at or below the threshold as silence', function () {
    $station = silentFor(sweptStation(), 3600);

    expect(verdictFor($station, status(['rms' => 0.0001])))->toBe(StationAudioVerdict::Stop)
        ->and(verdictFor($station, status(['rms' => 0.01])))->toBe(StationAudioVerdict::InUse);
});

it('keeps a station whose source says live even if the socket flag disagrees', function () {
    // The two should never disagree. If they do, the reading that keeps the
    // station on air wins.
    $station = silentFor(sweptStation(), 3600);

    expect(verdictFor($station, status(['broadcaster' => false, 'source' => 'live'])))
        ->toBe(StationAudioVerdict::InUse);
});

// ── Every unknown fails safe ──

it('never stops a station whose container did not answer', function () {
    $station = silentFor(sweptStation(), 86400);

    expect(verdictFor($station, null))->toBe(StationAudioVerdict::Unreachable);
});

it('never stops a station whose container is not ready yet', function () {
    $station = silentFor(sweptStation(), 86400);

    expect(verdictFor($station, status(['ready' => false])))->toBe(StationAudioVerdict::Unreachable);
});

it('never stops a container too old to report the fields', function () {
    // Mid-rollout every station looks like this until it is recreated.
    // Stopping the fleet over a merely absent field would be the worst
    // possible way to ship this.
    $station = silentFor(sweptStation(), 86400);

    expect(verdictFor($station, status(['broadcaster' => null])))->toBe(StationAudioVerdict::Unreported)
        ->and(verdictFor($station, status(['rms' => null])))->toBe(StationAudioVerdict::Unreported);
});

// ── The window ──

it('starts the clock rather than stopping on the first silent observation', function () {
    $station = sweptStation();

    expect($station->silent_since)->toBeNull()
        ->and(verdictFor($station, status()))->toBe(StationAudioVerdict::Silent);
});

it('leaves a station alone inside the window', function () {
    $station = silentFor(sweptStation(), 30);

    expect(verdictFor($station, status()))->toBe(StationAudioVerdict::Silent);
});

it('stops a station silent for longer than the window', function () {
    $station = silentFor(sweptStation(), 90);

    expect(verdictFor($station, status()))->toBe(StationAudioVerdict::Stop);
});

it('is disabled entirely when the window is zero', function () {
    config(['liquidsoap.silent_stop_seconds' => 0]);
    $station = silentFor(sweptStation(), 86400);

    expect(app(StationAudioPolicy::class)->enabled())->toBeFalse()
        ->and(verdictFor($station, status()))->toBe(StationAudioVerdict::InUse);
});

it('treats a jingle-only library as nothing to play', function () {
    // Jingles are punctuation. A library of nothing but jingles has nothing
    // to punctuate, so this is an idle station rather than a broken rotation.
    $station = silentFor(sweptStation(autoDj: true), 3600);
    Track::factory()->for($station)->create(['kind' => Track::KIND_JINGLE]);

    expect(verdictFor($station, status()))->toBe(StationAudioVerdict::Stop);
});

// ── The command ──

it('dispatches a stop for a station past its window', function () {
    Queue::fake();
    Http::fake(['*/status' => Http::response(status(), 200)]);
    $station = silentFor(sweptStation(), 90);

    test()->artisan('stations:sweep')->assertExitCode(0);

    Queue::assertPushed(StopStation::class, fn ($job) => $job->stationId === $station->id);
});

it('records the clock on the first pass and stops on a later one', function () {
    Queue::fake();
    Http::fake(['*/status' => Http::response(status(), 200)]);
    $station = sweptStation();

    test()->artisan('stations:sweep')->assertExitCode(0);

    expect($station->fresh()->silent_since)->not->toBeNull();
    Queue::assertNotPushed(StopStation::class);

    // Wind the clock past the window and sweep again.
    silentFor($station, 90);
    test()->artisan('stations:sweep')->assertExitCode(0);

    Queue::assertPushed(StopStation::class);
});

it('clears the clock as soon as the station is in use again', function () {
    Queue::fake();
    Http::fake(['*/status' => Http::response(status(['broadcaster' => true]), 200)]);
    $station = silentFor(sweptStation(), 30);

    test()->artisan('stations:sweep')->assertExitCode(0);

    // The window measures CONTINUOUS silence — any use resets it.
    expect($station->fresh()->silent_since)->toBeNull();
});

it('leaves the clock alone while the container is unreachable', function () {
    // An outage must not restart the window for a station that was already
    // silent when the container stopped answering.
    Queue::fake();
    Http::fake(fn () => throw new ConnectionException('down'));
    $station = silentFor(sweptStation(), 30);
    $before = $station->fresh()->silent_since;

    test()->artisan('stations:sweep')->assertExitCode(0);

    expect($station->fresh()->silent_since?->timestamp)->toBe($before?->timestamp);
    Queue::assertNotPushed(StopStation::class);
});

it('never sweeps a station that is already off air', function () {
    Queue::fake();
    Http::fake(['*/status' => Http::response(status(), 200)]);
    $station = silentFor(sweptStation(), 86400);
    $station->update(['desired_state' => Station::STATE_STOPPED]);

    test()->artisan('stations:sweep')->assertExitCode(0);

    Queue::assertNotPushed(StopStation::class);
});

it('stops nothing in a dry run', function () {
    Queue::fake();
    Http::fake(['*/status' => Http::response(status(), 200)]);
    $station = silentFor(sweptStation(), 90);

    test()->artisan('stations:sweep', ['--dry-run' => true])->assertExitCode(0);

    Queue::assertNotPushed(StopStation::class);
    expect($station->fresh()->silent_since)->not->toBeNull();
});

// ── The job ──

it('stops the station when the job runs and the verdict still holds', function () {
    Http::fake(['*/status' => Http::response(status(), 200)]);
    $station = silentFor(sweptStation(), 90);

    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldReceive('stop')->once()->with(Mockery::on(
        fn (Station $s) => $s->id === $station->id
    ));

    (new StopStation($station->id))->handle(
        app(StationAudioPolicy::class), app(StationStatusService::class), $lifecycle,
    );

    expect($station->fresh()->silent_since)->toBeNull();
});

it('does nothing when the broadcaster reconnected while the job was queued', function () {
    // A queued job is a reminder to look, never a decision already taken.
    Http::fake(['*/status' => Http::response(status(['broadcaster' => true]), 200)]);
    $station = silentFor(sweptStation(), 90);

    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldNotReceive('stop');

    (new StopStation($station->id))->handle(
        app(StationAudioPolicy::class), app(StationStatusService::class), $lifecycle,
    );
});

it('does nothing when the station was deleted while the job was queued', function () {
    Http::fake();
    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldNotReceive('stop');

    $job = new StopStation('01JQZZZZZZZZZZZZZZZZZZZZZZ');

    expect(fn () => $job->handle(
        app(StationAudioPolicy::class), app(StationStatusService::class), $lifecycle,
    ))->not->toThrow(Throwable::class);
});

it('swallows a lifecycle refusal when someone goes live in the race window', function () {
    // stop() is called with force: false precisely so this can happen. Losing
    // the stop is free; cutting off a live broadcaster is not.
    Http::fake(['*/status' => Http::response(status(), 200)]);
    $station = silentFor(sweptStation(), 90);

    $lifecycle = Mockery::mock(StationLifecycleService::class);
    $lifecycle->shouldReceive('stop')->once()->andThrow(StationLifecycleException::liveBroadcast());

    $job = new StopStation($station->id);

    expect(fn () => $job->handle(
        app(StationAudioPolicy::class), app(StationStatusService::class), $lifecycle,
    ))->not->toThrow(Throwable::class);

    expect($station->fresh()->desired_state)->toBe(Station::STATE_RUNNING);
});
