<?php

use App\Jobs\AnalyzeTrack;
use App\Jobs\MeasureTrackDuration;
use App\Models\Station;
use App\Models\Track;
use App\Services\PlaylistFileWriter;
use App\Services\TrackAnalysis;
use App\Services\TrackAnalyzer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

/**
 * A track's length stops being the upload header's guess once it has been
 * decoded. The AutoDJ planner times hard slot starts with it, so a wrong
 * length is a slot that starts early or late.
 */
beforeEach(function () {
    $this->station = Station::factory()->create();
});

function runAnalysis(Track $track): void
{
    app(AnalyzeTrack::class, ['trackId' => $track->getKey()])
        ->handle(app(TrackAnalyzer::class), app(PlaylistFileWriter::class));
}

it('replaces the header length with the decoded one at analysis', function () {
    $track = Track::factory()->for($this->station)->create(['duration_seconds' => 250.0]);

    $this->mock(TrackAnalyzer::class)->shouldReceive('analyze')->once()->andReturn(new TrackAnalysis(
        loudnessLufs: -9.0, truePeakDb: -0.5, decodedSeconds: 232.1404,
    ));

    runAnalysis($track);
    $track->refresh();

    expect($track->duration_seconds)->toBe(232.14)
        ->and($track->duration_measured_at)->not->toBeNull();
});

it('judges cue points against the decoded length, not the header', function () {
    // Header says 250s, the file really ends at 232s: a cue-out at 231.98 is
    // the file's own end and says nothing, so it is dropped.
    $track = Track::factory()->for($this->station)->create(['duration_seconds' => 250.0]);

    $this->mock(TrackAnalyzer::class)->shouldReceive('analyze')->once()->andReturn(new TrackAnalysis(
        loudnessLufs: -9.0, truePeakDb: -0.5, cueOutSeconds: 231.98, decodedSeconds: 232.0,
    ));

    runAnalysis($track);

    expect($track->fresh()->cue_out_seconds)->toBeNull();
});

it('keeps the header length, unmarked, when the decode gave none', function () {
    $track = Track::factory()->for($this->station)->create(['duration_seconds' => 250.0]);

    $this->mock(TrackAnalyzer::class)->shouldReceive('analyze')->once()->andReturn(new TrackAnalysis(
        loudnessLufs: -9.0, truePeakDb: -0.5,
    ));

    runAnalysis($track);
    $track->refresh();

    expect($track->duration_seconds)->toBe(250.0)
        ->and($track->duration_measured_at)->toBeNull();
});

it('re-measures an old track without touching its analysis', function () {
    $track = Track::factory()->for($this->station)->analyzed(cueIn: 1.5, cueOut: 228.0)
        ->create(['duration_seconds' => 250.0, 'duration_measured_at' => null]);

    $this->mock(TrackAnalyzer::class)->shouldReceive('measureDuration')->once()->andReturn(232.0);

    app(MeasureTrackDuration::class, ['trackId' => $track->getKey()])
        ->handle(app(TrackAnalyzer::class), app(PlaylistFileWriter::class));
    $track->refresh();

    expect($track->duration_seconds)->toBe(232.0)
        ->and($track->duration_measured_at)->not->toBeNull()
        ->and($track->cue_in_seconds)->toBe(1.5)
        ->and($track->cue_out_seconds)->toBe(228.0);
});

it('leaves an undecodable track unmeasured', function () {
    $track = Track::factory()->for($this->station)->create(['duration_seconds' => 250.0]);

    $this->mock(TrackAnalyzer::class)->shouldReceive('measureDuration')->once()->andReturn(null);

    app(MeasureTrackDuration::class, ['trackId' => $track->getKey()])
        ->handle(app(TrackAnalyzer::class), app(PlaylistFileWriter::class));

    expect($track->fresh()->duration_measured_at)->toBeNull();
});

it('queues a measurement only for tracks still on the header length', function () {
    Queue::fake();
    $guess = Track::factory()->for($this->station)->create();
    Track::factory()->for($this->station)->analyzed()->create();

    $this->artisan('tracks:measure-durations')->assertSuccessful();

    Queue::assertPushed(MeasureTrackDuration::class, 1);
    Queue::assertPushed(MeasureTrackDuration::class, fn (MeasureTrackDuration $job): bool => $job->trackId === $guess->getKey());
});

it('stops at the limit', function () {
    Queue::fake();
    Track::factory()->for($this->station)->count(3)->create();

    $this->artisan('tracks:measure-durations', ['--limit' => 2])->assertSuccessful();

    Queue::assertPushed(MeasureTrackDuration::class, 2);
});

it('counts airtime from cue-in to cue-out', function () {
    $track = Track::factory()->for($this->station)->analyzed(cueIn: 2.5, cueOut: 246.0)
        ->create(['duration_seconds' => 250.0]);

    expect($track->airtimeSeconds())->toBe(243.5);
});

it('counts the whole file when there are no cue points', function () {
    $track = Track::factory()->for($this->station)->analyzed(cueIn: null, cueOut: 250.0)
        ->create(['duration_seconds' => 250.0]);

    // A cue-out at the file's own end is dropped, as in the annotation.
    expect($track->airtimeSeconds())->toBe(250.0);
});

it('has no airtime until the length is measured', function () {
    $track = Track::factory()->for($this->station)->create(['duration_seconds' => 250.0]);

    expect($track->airtimeSeconds())->toBeNull();
});
