<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where the AutoDJ rotation has got to, so Laravel can answer "what plays
 * next" one track at a time (see AutoDjScheduler).
 *
 * Holds a POSITION rather than a track id, and that is deliberate: positions
 * survive the track they pointed at being deleted, so the rotation resumes at
 * the same place in the running order instead of restarting. A reorder moves
 * the cursor's meaning, which is the honest outcome — the owner just changed
 * what "next" means.
 *
 * Nullable = never played. The first request starts at the top.
 *
 * Note the side benefit over the playlist() source this replaces: a container
 * restart used to send the rotation back to track one, because the playlist
 * cursor lived in Liquidsoap's memory. Persisting it here means a restart
 * resumes where the station left off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->unsignedInteger('autodj_cursor_position')->nullable()->after('desired_state');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('autodj_cursor_position');
        });
    }
};
