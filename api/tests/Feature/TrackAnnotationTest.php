<?php

use App\Jobs\AnalyzeTrack;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\AutoDjScheduler;
use App\Services\PlaylistFileWriter;
use App\Services\TrackAnalysis;
use App\Services\TrackAnalyzer;
use App\Services\TrackImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

/**
 * The annotations are the contract between the analyser and the audio graph.
 * `liq_cue_in`, `liq_cue_out` and `liq_amplify` are Liquidsoap's own key
 * names — read by the request layer and the amplify operator respectively —
 * so a rename here does not fail anywhere, it just silently stops working.
 */
beforeEach(function () {
    config()->set('liquidsoap.loudness_target_lufs', -14.0);
    config()->set('liquidsoap.loudness_ceiling_db', -1.0);
    config()->set('liquidsoap.loudness_max_gain_db', 12.0);
    config()->set('liquidsoap.apply_amplify', true);

    $this->station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'night-shift']);
});

it('annotates cue points and gain on a measured track', function () {
    $track = Track::factory()->for($this->station)->analyzed(
        loudnessLufs: -9.0,
        truePeakDb: -6.0,
        cueIn: 2.5,
        cueOut: 178.0,
    )->create(['duration_seconds' => 180.0]);

    $uri = app(PlaylistFileWriter::class)->annotateTrack($track);

    expect($uri)->toContain('liq_cue_in="2.500"')
        ->and($uri)->toContain('liq_cue_out="178.000"')
        // The dB suffix is not decoration: a bare float is read as a LINEAR
        // multiplier, so "-5" would mean inverted phase at five times the
        // volume rather than five decibels down.
        ->and($uri)->toContain('liq_amplify="-5.00 dB"');
});

it('leaves an unanalysed track exactly as it was before any of this existed', function () {
    $track = Track::factory()->for($this->station)->create(['duration_seconds' => 180.0]);

    $uri = app(PlaylistFileWriter::class)->annotateTrack($track);

    expect($uri)->not->toContain('liq_cue_in')
        ->and($uri)->not->toContain('liq_cue_out')
        ->and($uri)->not->toContain('liq_amplify')
        ->and($uri)->toContain('title=');
});

it('keeps cue points when loudness correction is switched off', function () {
    // Two separate corrections. A reason to distrust the gain is not a reason
    // to start playing three seconds of silence again.
    config()->set('liquidsoap.apply_amplify', false);

    $track = Track::factory()->for($this->station)->analyzed(
        loudnessLufs: -9.0, truePeakDb: -6.0, cueIn: 2.5, cueOut: 178.0,
    )->create(['duration_seconds' => 180.0]);

    $uri = app(PlaylistFileWriter::class)->annotateTrack($track);

    expect($uri)->toContain('liq_cue_in="2.500"')
        ->and($uri)->not->toContain('liq_amplify');
});

it('sends the same annotations down the dynamic rotation path', function () {
    // AutoDjScheduler and the m3u writer share one builder on purpose: two
    // builders would be two places for this contract to drift, and the dynamic
    // path is the one that actually plays.
    $track = Track::factory()->for($this->station)->analyzed(
        loudnessLufs: -20.0, truePeakDb: -14.0, cueIn: 1.0, cueOut: 100.0,
    )->create(['duration_seconds' => 120.0, 'position' => 1]);

    $uri = app(AutoDjScheduler::class)->next($this->station->fresh());

    expect($uri)->toContain('liq_cue_in="1.000"')
        ->and($uri)->toContain('liq_amplify="6.00 dB"')
        ->and($uri)->toContain(basename((string) $track->path));
});

it('annotates a levelled jingle without losing the jingle flag', function () {
    // The flag is how the script recognises a station ID downstream — it must
    // survive alongside the new keys, or jingles start getting crossfaded and
    // reported as now-playing.
    $track = Track::factory()->for($this->station)->analyzed(
        loudnessLufs: -6.0, truePeakDb: -3.0, cueIn: 0.4, cueOut: null,
    )->create(['kind' => Track::KIND_JINGLE, 'duration_seconds' => 8.0]);

    $uri = app(PlaylistFileWriter::class)->annotateTrack($track, isJingle: true);

    expect($uri)->toStartWith('annotate:jingle="true"')
        ->and($uri)->toContain('liq_amplify="-8.00 dB"');
});

it('relevels the whole library when the target moves', function () {
    $track = Track::factory()->for($this->station)->analyzed(
        loudnessLufs: -9.0, truePeakDb: -8.0, cueIn: null, cueOut: null,
    )->create(['duration_seconds' => 180.0]);

    $writer = app(PlaylistFileWriter::class);

    expect($writer->annotateTrack($track))->toContain('liq_amplify="-5.00 dB"');

    config()->set('liquidsoap.loudness_target_lufs', -16.0);

    // No re-analysis, no restart, nothing written — the gain is derived when
    // the annotation is built.
    expect($writer->annotateTrack($track->fresh()))->toContain('liq_amplify="-7.00 dB"');
});

it('records a failed analysis instead of retrying it forever', function () {
    $track = Track::factory()->for($this->station)->create();

    $this->mock(TrackAnalyzer::class)
        ->shouldReceive('analyze')
        ->once()
        ->andReturn(TrackAnalysis::failed('moov atom not found'));

    app(AnalyzeTrack::class, ['trackId' => $track->getKey()])
        ->handle(app(TrackAnalyzer::class), app(PlaylistFileWriter::class));

    $track->refresh();

    // analyzed_at set on failure too: that is what keeps the backfill from
    // picking the same undecodable file up on every pass.
    expect($track->analyzed_at)->not->toBeNull()
        ->and($track->analysis_error)->toBe('moov atom not found')
        ->and($track->loudness_lufs)->toBeNull();
});

it('stores measurements without disturbing the station', function () {
    $track = Track::factory()->for($this->station)->create(['duration_seconds' => 180.0]);
    $touchedAt = $this->station->updated_at;

    $this->mock(TrackAnalyzer::class)
        ->shouldReceive('analyze')
        ->once()
        ->andReturn(new TrackAnalysis(
            loudnessLufs: -9.0, truePeakDb: -0.5, cueInSeconds: 2.0, cueOutSeconds: 175.0,
        ));

    app(AnalyzeTrack::class, ['trackId' => $track->getKey()])
        ->handle(app(TrackAnalyzer::class), app(PlaylistFileWriter::class));

    $track->refresh();

    expect($track->loudness_lufs)->toBe(-9.0)
        ->and($track->cue_in_seconds)->toBe(2.0)
        ->and($track->analysis_error)->toBeNull()
        // saveQuietly, so the observers never fire: a backfill must not
        // re-render every .liq and restart the fleet.
        ->and($this->station->fresh()->updated_at->eq($touchedAt))->toBeTrue();
});

it('queues the analysis on upload rather than making the request wait', function () {
    // A full decode is seconds of CPU on a long mix. An upload that waited for
    // it is an upload that times out on a slow box, and the measurement is not
    // needed until the track's turn comes round.
    Queue::fake();
    config(['liquidsoap.playlists_dir' => $dir = sys_get_temp_dir().'/gocast-annotate-'.uniqid()]);

    $track = app(TrackImporter::class)->import(
        $this->station,
        UploadedFile::fake()->create('song.mp3', 64, 'audio/mpeg'),
    );

    Queue::assertPushed(AnalyzeTrack::class, fn (AnalyzeTrack $job): bool => $job->trackId === $track->getKey());

    File::deleteDirectory($dir);
});

it('does not queue analysis when the install has it switched off', function () {
    Queue::fake();
    config(['liquidsoap.analysis_enabled' => false]);
    config(['liquidsoap.playlists_dir' => $dir = sys_get_temp_dir().'/gocast-annotate-'.uniqid()]);

    app(TrackImporter::class)->import(
        $this->station,
        UploadedFile::fake()->create('song.mp3', 64, 'audio/mpeg'),
    );

    Queue::assertNotPushed(AnalyzeTrack::class);

    File::deleteDirectory($dir);
});
