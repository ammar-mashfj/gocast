<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Splits "a station row exists" from "a station should be broadcasting".
 *
 * Until now the Station row *was* the desired state: StationObserver spawned
 * a Liquidsoap container on create and every recovery path assumed one should
 * exist. That costs a full container (memory + cpu + an Icecast source slot +
 * round-the-clock HLS writes) for stations nobody has ever broadcast from.
 *
 * `desired_state` makes the intent explicit so the supervisor, the reconciler
 * and the relaunch command can converge the daemon on what the DB says should
 * be running, rather than on what merely exists.
 *
 * Existing rows are backfilled to 'running': they have live containers right
 * now, and a deploy must not take anyone off air.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->enum('desired_state', ['stopped', 'running'])
                ->default('stopped')
                ->after('is_live');

            // When the station last transitioned to 'running'. Drives the
            // idle-reaper (auto-stop after N hours without listeners) and
            // gives the dashboard an "on air since" value.
            $table->timestamp('started_at')->nullable()->after('desired_state');

            // Cheap lookup for the reconciler, which lists every station
            // that should have a container on a 5-minute schedule.
            $table->index('desired_state');
        });

        DB::table('stations')->update(['desired_state' => 'running', 'started_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropIndex(['desired_state']);
            $table->dropColumn(['desired_state', 'started_at']);
        });
    }
};
