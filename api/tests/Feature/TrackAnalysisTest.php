<?php

use App\Services\TrackAnalysis;

/**
 * The arithmetic between "how loud is this file" and "what do we tell
 * Liquidsoap". Getting this wrong is audible on every track in the library, so
 * the guards matter more than the happy path — an over-eager gain clips, and
 * an over-eager cue truncates a song on air while the file itself looks fine
 * to anyone who goes to check.
 */
beforeEach(function () {
    config()->set('liquidsoap.loudness_target_lufs', -14.0);
    config()->set('liquidsoap.loudness_ceiling_db', -1.0);
    config()->set('liquidsoap.loudness_max_gain_db', 12.0);
    config()->set('liquidsoap.cue_min_playable_seconds', 5.0);
});

it('turns a loud master down to the target', function () {
    // The common case, and the one this feature exists for: a mastered single
    // sitting 5 dB above everything else in the rotation.
    $analysis = new TrackAnalysis(loudnessLufs: -9.0, truePeakDb: -0.5);

    expect($analysis->amplifyDb())->toBe(-5.0);
});

it('lifts a quiet track towards the target', function () {
    $analysis = new TrackAnalysis(loudnessLufs: -20.0, truePeakDb: -12.0);

    expect($analysis->amplifyDb())->toBe(6.0);
});

it('never raises a track past the peak ceiling', function () {
    // Loudness and peak are different measurements. A sparse, dynamic
    // recording can sit well below target while already touching 0 dBFS, and
    // the naive +9 dB would clip on every transient. The limiter downstream
    // would catch it, but a limiter working hard is distortion.
    $analysis = new TrackAnalysis(loudnessLufs: -23.0, truePeakDb: -2.0);

    // Target alone wants +9; the ceiling allows only -1.0 - (-2.0) = +1.
    expect($analysis->amplifyDb())->toBe(1.0);
});

it('refuses to amplify a near-silent file into noise', function () {
    // +34 dB would reach the target and bring the noise floor with it, hissing
    // louder than the content ever was. Past a point the file is just quiet.
    $analysis = new TrackAnalysis(loudnessLufs: -48.0, truePeakDb: -40.0);

    expect($analysis->amplifyDb())->toBe(12.0);
});

it('does not cap attenuation the way it caps gain', function () {
    // Turning something down cannot introduce noise, and the loud files are
    // the ones causing the problem.
    $analysis = new TrackAnalysis(loudnessLufs: 2.0, truePeakDb: 0.0);

    expect($analysis->amplifyDb())->toBe(-16.0);
});

it('says nothing at all about a track already at target', function () {
    // An annotation on every track in the library is not free to carry, and
    // below a fraction of a dB there is nothing a listener could hear.
    $analysis = new TrackAnalysis(loudnessLufs: -14.05, truePeakDb: -3.0);

    expect($analysis->amplifyDb())->toBeNull();
});

it('relevels the library when the target moves, with no re-analysis', function () {
    // The whole reason only raw measurements are stored: the gain is derived
    // when the annotation is built, so retuning the target takes effect at the
    // next track boundary rather than requiring every file to be decoded again.
    $analysis = new TrackAnalysis(loudnessLufs: -9.0, truePeakDb: -6.0);

    expect($analysis->amplifyDb())->toBe(-5.0);

    config()->set('liquidsoap.loudness_target_lufs', -18.0);

    expect($analysis->amplifyDb())->toBe(-9.0);
});

it('has nothing to say about a track that was never analysed', function () {
    expect((new TrackAnalysis)->amplifyDb())->toBeNull()
        ->and((new TrackAnalysis)->cuePoints(180.0))->toBe([null, null]);
});

it('trims silence off both ends', function () {
    $analysis = new TrackAnalysis(cueInSeconds: 2.5, cueOutSeconds: 178.0);

    expect($analysis->cuePoints(180.0))->toBe([2.5, 178.0]);
});

it('ignores a lead-in too short to be worth annotating', function () {
    $analysis = new TrackAnalysis(cueInSeconds: 0.01, cueOutSeconds: 178.0);

    expect($analysis->cuePoints(180.0))->toBe([null, 178.0]);
});

it('drops a cue-out that lands at the end of the file anyway', function () {
    // Annotating a boundary the decoder would have reached on its own says
    // nothing and only gives a future reader something to wonder about.
    $analysis = new TrackAnalysis(cueInSeconds: 2.0, cueOutSeconds: 179.99);

    expect($analysis->cuePoints(180.0))->toBe([2.0, null]);
});

it('discards a measurement that would truncate a track to nothing', function () {
    // A mis-detected threshold on a quiet ambient intro would otherwise cut
    // the track to three seconds on air. Both cue points go, not just one —
    // half a bad measurement is still a bad measurement.
    $analysis = new TrackAnalysis(cueInSeconds: 90.0, cueOutSeconds: 93.0);

    expect($analysis->cuePoints(180.0))->toBe([null, null]);
});

it('treats a failed analysis as having no results', function () {
    $analysis = TrackAnalysis::failed('moov atom not found');

    expect($analysis->succeeded())->toBeFalse()
        ->and($analysis->error)->toBe('moov atom not found')
        ->and($analysis->amplifyDb())->toBeNull();
});
