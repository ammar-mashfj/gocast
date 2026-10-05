<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When `duration_seconds` stopped being a guess.
 *
 * At upload the length comes from the file's header, which is often wrong
 * for VBR MP3s. Analysis decodes the whole file and replaces it with the
 * real figure; this column says that happened. The AutoDJ planner only
 * times hard slot starts around tracks that have it.
 *
 * Null for tracks uploaded before this shipped until
 * `tracks:measure-durations` has run over them.
 *
 * Guarded because a dev database that once ran the shelved
 * feat/station-log branch already has this exact column.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('tracks', 'duration_measured_at')) {
            return;
        }

        Schema::table('tracks', function (Blueprint $table) {
            $table->timestamp('duration_measured_at')->nullable()->after('duration_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            $table->dropColumn('duration_measured_at');
        });
    }
};
