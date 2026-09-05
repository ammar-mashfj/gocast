<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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
 * Existing rows are NOT backfilled; they take the default 'stopped'.
 * The original backfill set every row to 'running' on the premise that a
 * deploy must not take anyone off air. On this install nothing was on air
 * when it ran, so that premise inverted the intent it meant to preserve.
 * See the note in up().
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

        // Deliberately no backfill. Every row takes the column default
        // 'stopped': nothing was on air when this ran, and the only three
        // stations still carrying is_live = 1 had been soft-deleted weeks
        // earlier. A blanket 'running' would hand the reconciler ~29
        // stations to launch, and it would launch them —
        // RelaunchStations calls LiquidsoapSupervisor::up() directly and
        // never reaches the max_running_stations check.
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropIndex(['desired_state']);
            $table->dropColumn(['desired_state', 'started_at']);
        });
    }
};
