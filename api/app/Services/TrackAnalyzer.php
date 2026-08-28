<?php

namespace App\Services;

use Illuminate\Support\Facades\Process;

/**
 * Measures one audio file: how loud it is, and where the audio actually
 * starts and stops.
 *
 * Two numbers and two timestamps, from a single ffmpeg pass that decodes the
 * file once and discards the output. Nothing is written and the original is
 * never modified — the results become `liq_amplify` / `liq_cue_in` /
 * `liq_cue_out` annotations, so every correction happens at playback time and
 * is undone by clearing a database column.
 *
 * WHY THIS EXISTS. A station's library is other people's files: a mastered
 * single sits at 0 dBFS, a podcast export 20 dB below it, and a rip carries
 * three seconds of leading silence. Played back to back that is a listener
 * reaching for the volume knob between every track, and a gap that reads as
 * the stream having died. Neither is fixable downstream — a master-bus
 * compressor can only squash the difference after the fact, and no operator
 * can invent the audio that a silent lead-in isn't playing.
 *
 * The measurement is deliberately separate from what we do with it: this class
 * answers "how loud is this file", and the target it should be moved to lives
 * in config, applied when the annotation is built. See TrackAnalysis.
 */
class TrackAnalyzer
{
    /**
     * ffmpeg exits 0 on a file it cannot decode in some cases, so success is
     * judged on having parsed a loudness figure rather than on the exit code.
     */
    public function analyze(string $absolutePath): TrackAnalysis
    {
        if (! is_file($absolutePath) || ! is_readable($absolutePath)) {
            return TrackAnalysis::failed('file is missing or unreadable');
        }

        try {
            $result = Process::timeout($this->timeout())->run($this->command($absolutePath));
        } catch (\Throwable $e) {
            return TrackAnalysis::failed('analysis could not be run: '.$e->getMessage());
        }

        // Everything we read is on stderr: ffmpeg keeps stdout for the media
        // stream, which here is the null muxer.
        $output = $result->errorOutput().$result->output();

        $loudness = $this->parseLoudness($output);

        if ($loudness === null) {
            return TrackAnalysis::failed($this->summarise($output));
        }

        [$cueIn, $cueOut] = $this->parseCuePoints($output);

        return new TrackAnalysis(
            loudnessLufs: $loudness['input_i'],
            truePeakDb: $loudness['input_tp'],
            cueInSeconds: $cueIn,
            cueOutSeconds: $cueOut,
        );
    }

    /**
     * One decode, both measurements.
     *
     * `silencedetect` and `loudnorm` are chained rather than run as two passes
     * because each pass costs a full decode, and both filters pass the audio
     * through untouched — the chain is measurement only. `-f null -` throws the
     * decoded samples away; nothing is encoded.
     *
     * `loudnorm` is used purely as a meter here (its `input_i` / `input_tp`
     * are the file's own figures, unaffected by any target passed to it) and is
     * preferred over `ebur128` only because it prints JSON. The two were
     * checked against each other on known signals and agree to 0.05 dB.
     *
     * @return list<string>
     */
    private function command(string $absolutePath): array
    {
        $filters = sprintf(
            'silencedetect=noise=%sdB:d=%s,loudnorm=print_format=json',
            $this->float((float) config('liquidsoap.analysis_silence_db', -50)),
            $this->float((float) config('liquidsoap.analysis_silence_seconds', 0.25)),
        );

        $binary = trim((string) config('liquidsoap.analysis_ffmpeg', ''));

        if ($binary !== '') {
            return [$binary, '-hide_banner', '-nostats', '-i', $absolutePath, '-af', $filters, '-f', 'null', '-'];
        }

        // No local ffmpeg: borrow the station image's, which is the same build
        // that decodes the file on air. The API container already talks to the
        // Docker daemon to run stations, and Liquidsoap needs a container in
        // every supported run mode, so this is not a new dependency — it just
        // avoids putting a second ffmpeg in the API image to do it.
        //
        // The file is mounted read-only at a fixed path. Its own name never
        // reaches the container, which keeps a filename out of an argument
        // list that would otherwise have to be escaped for two layers.
        return [
            'docker', 'run', '--rm', '--network', 'none',
            '--entrypoint', 'ffmpeg',
            '-v', $absolutePath.':/analysis-input:ro',
            (string) config('liquidsoap.image', 'gocast/liquidsoap:latest'),
            '-hide_banner', '-nostats', '-i', '/analysis-input', '-af', $filters, '-f', 'null', '-',
        ];
    }

    /**
     * loudnorm's JSON block, which is the last thing it prints.
     *
     * @return array{input_i: float, input_tp: float}|null
     */
    private function parseLoudness(string $output): ?array
    {
        if (! preg_match_all('/\{[^{}]*"input_i"[^{}]*\}/s', $output, $matches)) {
            return null;
        }

        $decoded = json_decode((string) end($matches[0]), true);

        if (! is_array($decoded) || ! isset($decoded['input_i'], $decoded['input_tp'])) {
            return null;
        }

        // ffmpeg prints these as STRINGS, and for a file with no signal at all
        // the string is "-inf". Casting that to float yields 0.0, not -INF —
        // so a silent file would read as sitting at 0 LUFS and be attenuated
        // 14 dB for no reason. is_numeric() is the check that catches it;
        // is_finite() on the result never would.
        if (! is_numeric($decoded['input_i']) || ! is_numeric($decoded['input_tp'])) {
            return null;
        }

        $loudness = (float) $decoded['input_i'];
        $peak = (float) $decoded['input_tp'];

        // Below the R128 absolute gate there is no programme material to
        // measure, only a noise floor.
        if (! is_finite($loudness) || ! is_finite($peak) || $loudness <= -70.0) {
            return null;
        }

        return ['input_i' => $loudness, 'input_tp' => $peak];
    }

    /**
     * Leading and trailing silence, from silencedetect's running commentary.
     *
     * It emits a `silence_start` when the signal drops below the threshold and
     * a matching `silence_end` when it comes back. Two of those blocks matter:
     *
     *   - one starting at (or within a hair of) zero — that is the lead-in, and
     *     its `silence_end` is where the music begins;
     *   - one running to the end of the file — its `silence_start` is where the
     *     music stopped.
     *
     * Silence in the MIDDLE of a track is left alone. It is either intentional
     * or a gap between movements, and cutting it would be editing the audio
     * rather than trimming its edges.
     *
     * Identifying the tail is the subtle half, and the obvious rule is wrong.
     * A block that runs to EOF looks unterminated, so "the block with no
     * silence_end" seems to name it — but ffmpeg CLOSES that block at the end
     * of the stream, emitting a silence_end at the file's own duration
     * (observed on 7.1: a file ending in three seconds of silence printed
     * `silence_end: 9.5` against a 9.53s duration). The rule has to be
     * positional instead: the last block whose END reaches the end of the
     * decode. Without that comparison a five-second gap in the middle of a
     * three-minute track reads as the tail, and the last two minutes are cut.
     *
     * @return array{0: float|null, 1: float|null}
     */
    private function parseCuePoints(string $output): array
    {
        preg_match_all(
            '/silence_(start|end):\s*(-?[0-9]*\.?[0-9]+)/',
            $output,
            $matches,
            PREG_SET_ORDER,
        );

        // Blocks as [start, end|null], in the order ffmpeg reported them.
        $blocks = [];
        $openedAt = null;

        foreach ($matches as $match) {
            $seconds = (float) $match[2];

            if ($match[1] === 'start') {
                if ($openedAt !== null) {
                    $blocks[] = [$openedAt, null];
                }
                $openedAt = $seconds;

                continue;
            }

            if ($openedAt !== null) {
                $blocks[] = [$openedAt, $seconds];
                $openedAt = null;
            }
        }

        if ($openedAt !== null) {
            $blocks[] = [$openedAt, null];
        }

        if ($blocks === []) {
            return [null, null];
        }

        $decoded = $this->parseDecodedSeconds($output);

        $cueIn = null;
        $cueOut = null;

        foreach ($blocks as [$start, $end]) {
            if ($start <= 0.05 && $end !== null && $cueIn === null) {
                $cueIn = $end;
            }
        }

        [$lastStart, $lastEnd] = $blocks[count($blocks) - 1];

        // Reaches the end of the decode either by running off it (no
        // silence_end) or by closing at it. A block that closed early is a gap
        // in the middle and is not ours to cut.
        $reachesEnd = $lastEnd === null
            || ($decoded !== null && $lastEnd >= $decoded - 0.25);

        if ($reachesEnd && $lastStart > 0.05) {
            $cueOut = $lastStart;
        }

        return [$cueIn, $cueOut];
    }

    /**
     * How much audio ffmpeg actually decoded, from the progress summary it
     * prints when it finishes (`time=00:00:09.50`).
     *
     * Taken from the same pass rather than from the duration in the tags: the
     * silencedetect timestamps are the decoder's own clock, and comparing them
     * to a figure from a different reader is how a file whose header lies
     * about its length gets its tail cut off.
     */
    private function parseDecodedSeconds(string $output): ?float
    {
        if (! preg_match_all('/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/', $output, $matches, PREG_SET_ORDER)) {
            return null;
        }

        $last = end($matches);

        return ((int) $last[1] * 3600) + ((int) $last[2] * 60) + (float) $last[3];
    }

    /**
     * A one-line reason for the failure column, out of ffmpeg's last words.
     *
     * The whole of stderr is far too much to store and mostly banner noise, so
     * this keeps the last non-empty line — which is where ffmpeg puts the
     * reason it gave up.
     */
    private function summarise(string $output): string
    {
        $lines = array_values(array_filter(
            array_map('trim', preg_split('/\r?\n/', $output) ?: []),
            static fn (string $line): bool => $line !== '',
        ));

        $reason = $lines === [] ? 'ffmpeg produced no output' : (string) end($lines);

        return mb_substr($reason, 0, 255);
    }

    private function timeout(): int
    {
        return max(5, (int) config('liquidsoap.analysis_timeout_seconds', 120));
    }

    /**
     * Filter arguments are parsed by ffmpeg's own lexer, which wants a plain
     * decimal — and the process locale must never be able to turn 0.25 into
     * "0,25" in a filter string.
     */
    private function float(float $value): string
    {
        return rtrim(rtrim(number_format($value, 4, '.', ''), '0'), '.') ?: '0';
    }
}
