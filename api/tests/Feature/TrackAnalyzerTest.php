<?php

use App\Services\TrackAnalyzer;
use Illuminate\Support\Facades\Process;

/**
 * Parsing ffmpeg's output. The fixtures here are REAL captures from the
 * pinned station image (2.4.5, ffmpeg 7.1) rather than hand-written samples —
 * the formatting of these lines is the actual contract, and inventing it would
 * test only that the regexes match themselves.
 */
function ffmpegOutput(string $body): void
{
    Process::fake(['*' => Process::result(output: '', errorOutput: $body)]);
}

/** A 9.53s file: 2.5s of silence, 4s of tone, 3s of silence. */
function paddedCapture(): string
{
    return <<<'OUT'
    Stream mapping:
      Stream #0:0 -> #0:0 (mp3 (mp3float) -> pcm_s16le (native))
    [silencedetect @ 0x70bd3c004280] silence_start: 0
    [silencedetect @ 0x70bd3c004280] silence_end: 2.500181 | silence_duration: 2.500181
    [silencedetect @ 0x70bd3c004280] silence_start: 6.499841
    [silencedetect @ 0x70bd3c004280] silence_end: 9.5 | silence_duration: 3.000159
    [Parsed_loudnorm_1 @ 0x70bd3c004400]
    {
    	"input_i" : "-41.51",
    	"input_tp" : "-41.16",
    	"input_lra" : "7.80",
    	"input_thresh" : "-51.51",
    	"output_i" : "-13.82",
    	"output_tp" : "-11.06",
    	"output_lra" : "6.30",
    	"output_thresh" : "-23.92",
    	"normalization_type" : "dynamic",
    	"target_offset" : "-0.18"
    }
    size=N/A time=00:00:09.50 bitrate=N/A speed=28.4x
    OUT;
}

beforeEach(function () {
    // A real file so the readability guard passes; its contents are never
    // decoded because the process is faked.
    $this->path = tempnam(sys_get_temp_dir(), 'gocast-analysis').'.mp3';
    file_put_contents($this->path, 'not really audio');
});

afterEach(function () {
    @unlink($this->path);
});

it('reads loudness and true peak out of the loudnorm json', function () {
    ffmpegOutput(paddedCapture());

    $analysis = app(TrackAnalyzer::class)->analyze($this->path);

    expect($analysis->succeeded())->toBeTrue()
        ->and($analysis->loudnessLufs)->toBe(-41.51)
        ->and($analysis->truePeakDb)->toBe(-41.16);
});

it('finds the lead-in from a silence block that starts at zero', function () {
    ffmpegOutput(paddedCapture());

    expect(app(TrackAnalyzer::class)->analyze($this->path)->cueInSeconds)->toBe(2.500181);
});

it('finds the tail from the block that reaches the end of the decode', function () {
    // The obvious rule — "the block with no silence_end" — is wrong. ffmpeg
    // CLOSES the trailing block at end of stream, so it looks exactly like a
    // gap in the middle; only its end landing at the decoded duration tells
    // them apart. This capture is the real thing: silence_end: 9.5 against
    // time=00:00:09.50.
    ffmpegOutput(paddedCapture());

    expect(app(TrackAnalyzer::class)->analyze($this->path)->cueOutSeconds)->toBe(6.499841);
});

it('still finds the tail when ffmpeg leaves the block unterminated', function () {
    $capture = str_replace(
        "[silencedetect @ 0x70bd3c004280] silence_end: 9.5 | silence_duration: 3.000159\n",
        '',
        paddedCapture(),
    );
    ffmpegOutput($capture);

    expect(app(TrackAnalyzer::class)->analyze($this->path)->cueOutSeconds)->toBe(6.499841);
});

it('does not mistake a long gap mid-track for the end of the song', function () {
    // The failure this guards against is silent and expensive: a five-second
    // gap 40s into a three-minute track would cue out there and cut the last
    // two minutes, while the file itself plays fine to anyone who checks.
    ffmpegOutput(<<<'OUT'
    [silencedetect @ 0x1] silence_start: 0
    [silencedetect @ 0x1] silence_end: 1.2 | silence_duration: 1.2
    [silencedetect @ 0x1] silence_start: 40.0
    [silencedetect @ 0x1] silence_end: 45.0 | silence_duration: 5.0
    [Parsed_loudnorm_1 @ 0x2]
    {
    	"input_i" : "-12.20",
    	"input_tp" : "-0.90"
    }
    size=N/A time=00:03:00.00 bitrate=N/A speed=28.4x
    OUT);

    $analysis = app(TrackAnalyzer::class)->analyze($this->path);

    expect($analysis->cueInSeconds)->toBe(1.2)
        ->and($analysis->cueOutSeconds)->toBeNull();
});

it('leaves silence in the middle of a track alone', function () {
    // Either intentional or a gap between movements. Cutting it would be
    // editing the audio rather than trimming its edges.
    ffmpegOutput(<<<'OUT'
    [silencedetect @ 0x1] silence_start: 40.2
    [silencedetect @ 0x1] silence_end: 44.9 | silence_duration: 4.7
    [Parsed_loudnorm_1 @ 0x2]
    {
    	"input_i" : "-12.20",
    	"input_tp" : "-0.90"
    }
    size=N/A time=00:03:00.00 bitrate=N/A speed=28.4x
    OUT);

    $analysis = app(TrackAnalyzer::class)->analyze($this->path);

    expect($analysis->cueInSeconds)->toBeNull()
        ->and($analysis->cueOutSeconds)->toBeNull()
        ->and($analysis->loudnessLufs)->toBe(-12.2);
});

it('reports a file it cannot decode instead of guessing', function () {
    ffmpegOutput("[mov,mp4 @ 0x1] moov atom not found\n/analysis-input: Invalid data found when processing input\n");

    $analysis = app(TrackAnalyzer::class)->analyze($this->path);

    expect($analysis->succeeded())->toBeFalse()
        ->and($analysis->error)->toContain('Invalid data found');
});

it('treats a wholly silent file as unmeasurable rather than as 0 LUFS', function () {
    // ffmpeg prints "-inf" here, which a naive cast turns into 0.0 — and a
    // track we believed was sitting at 0 LUFS would be attenuated hard for no
    // reason at all.
    ffmpegOutput(<<<'OUT'
    [Parsed_loudnorm_1 @ 0x2]
    {
    	"input_i" : "-inf",
    	"input_tp" : "-inf"
    }
    OUT);

    expect(app(TrackAnalyzer::class)->analyze($this->path)->succeeded())->toBeFalse();
});

it('gives up on a missing file without running anything', function () {
    Process::fake();

    $analysis = app(TrackAnalyzer::class)->analyze('/no/such/track.mp3');

    expect($analysis->succeeded())->toBeFalse()
        ->and($analysis->error)->toContain('missing or unreadable');

    Process::assertNothingRan();
});

it('borrows the station image ffmpeg when no local binary is configured', function () {
    // Avoids a second ffmpeg in the API image, and decodes with exactly the
    // build that will play the file on air.
    config()->set('liquidsoap.analysis_ffmpeg', '');
    config()->set('liquidsoap.image', 'gocast/liquidsoap:test');
    ffmpegOutput(paddedCapture());

    app(TrackAnalyzer::class)->analyze($this->path);

    Process::assertRan(function ($process) {
        $command = is_array($process->command) ? implode(' ', $process->command) : $process->command;

        return str_contains($command, 'docker run')
            && str_contains($command, 'gocast/liquidsoap:test')
            // Nothing being measured needs the network.
            && str_contains($command, '--network none')
            && str_contains($command, '/analysis-input');
    });
});

it('uses a local ffmpeg when one is configured', function () {
    config()->set('liquidsoap.analysis_ffmpeg', '/usr/bin/ffmpeg');
    ffmpegOutput(paddedCapture());

    app(TrackAnalyzer::class)->analyze($this->path);

    Process::assertRan(function ($process) {
        $command = is_array($process->command) ? implode(' ', $process->command) : $process->command;

        return str_starts_with($command, '/usr/bin/ffmpeg')
            && ! str_contains($command, 'docker');
    });
});

it('writes filter thresholds as plain decimals whatever the locale', function () {
    // These go through ffmpeg's own lexer; a locale that renders 0.25 as
    // "0,25" would split the filter argument in two.
    config()->set('liquidsoap.analysis_ffmpeg', 'ffmpeg');
    config()->set('liquidsoap.analysis_silence_db', -47.5);
    config()->set('liquidsoap.analysis_silence_seconds', 0.25);
    ffmpegOutput(paddedCapture());

    app(TrackAnalyzer::class)->analyze($this->path);

    Process::assertRan(function ($process) {
        $command = is_array($process->command) ? implode(' ', $process->command) : $process->command;

        return str_contains($command, 'silencedetect=noise=-47.5dB:d=0.25');
    });
});
