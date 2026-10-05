<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel's AutoDJ clock: what it last handed the station's container.
 *
 * Liquidsoap asks for track N+1 the moment track N starts, and N is always
 * the last track served. So N+1 starts at now + N's airtime, and that is
 * the time every hard slot and jingle rule is judged at. Anchoring on "now"
 * at every call means an error (a live show, a slow file) never carries over
 * to the next track.
 *
 *   autodj_queued_starts_at — when the last served track was planned to start
 *   autodj_queued_seconds   — its airtime; null when nothing is queued
 *                             (container just booted, or the last answer was
 *                             "nothing to play"), so the next track starts now
 *   autodj_queued_is_jingle — whether it was a jingle: never two in a row
 *
 * Written with the query builder at every boundary, like the playlist
 * cursor, so no observer or `updated_at` bump happens on the audio path.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->timestamp('autodj_queued_starts_at', 3)->nullable();
            $table->double('autodj_queued_seconds')->nullable();
            $table->boolean('autodj_queued_is_jingle')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['autodj_queued_starts_at', 'autodj_queued_seconds', 'autodj_queued_is_jingle']);
        });
    }
};
