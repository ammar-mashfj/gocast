<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-track audio measurements, taken once on upload and read on every
 * rotation turn.
 *
 * These are MEASUREMENTS, not instructions. What Liquidsoap is actually told —
 * `liq_amplify` — is derived from `loudness_lufs` and `true_peak_db` against
 * the install's target at the moment the annotation is built, so retuning the
 * target relevels the whole library on the next track boundary instead of
 * requiring every file to be decoded again. Storing the gain instead would
 * have made the target permanent the day it was first chosen.
 *
 * All nullable, and the rotation is indifferent to that: an unanalysed track
 * simply carries no cue or amplify annotation and plays exactly as it did
 * before. That is what lets the analyser be a queued job rather than something
 * an upload has to wait for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            // Integrated loudness (EBU R128) and true peak, both dB. The pair
            // is what the gain calculation needs: the target sets the gain,
            // the peak caps it so a quiet-but-peaky master is not amplified
            // into clipping.
            $table->float('loudness_lufs')->nullable()->after('duration_seconds');
            $table->float('true_peak_db')->nullable()->after('loudness_lufs');

            // Where the audio really starts and stops, in seconds from the
            // head of the file. Silence trimmed at playback rather than on
            // disk, so the original upload is never modified and a bad
            // measurement is undone by clearing a column.
            $table->float('cue_in_seconds')->nullable()->after('true_peak_db');
            $table->float('cue_out_seconds')->nullable()->after('cue_in_seconds');

            // Null until the analyser has run. Set on success AND on failure —
            // paired with `analysis_error` below, so a file ffmpeg cannot
            // decode is not retried on every backfill pass forever.
            $table->timestamp('analyzed_at')->nullable()->after('cue_out_seconds');
            $table->string('analysis_error', 255)->nullable()->after('analyzed_at');

            // The backfill's working set: tracks never analysed. Partial-index
            // semantics are not portable, so this is a plain index on the
            // column the query filters by.
            $table->index('analyzed_at');
        });
    }

    public function down(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            $table->dropIndex(['analyzed_at']);
            $table->dropColumn([
                'loudness_lufs',
                'true_peak_db',
                'cue_in_seconds',
                'cue_out_seconds',
                'analyzed_at',
                'analysis_error',
            ]);
        });
    }
};
