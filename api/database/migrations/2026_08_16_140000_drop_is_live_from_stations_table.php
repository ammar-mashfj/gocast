<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops `stations.is_live`.
 *
 * The column was a stored copy of a fact the Liquidsoap container already
 * answers directly (`source == 'live'` over harbor). Being stored, it could
 * disagree with reality — a lost runOnNotReady webhook left it true forever,
 * which refused every stop with 409 and exempted the station from the idle
 * reaper. An entire strike-counting reconciler existed solely to repair that
 * disagreement.
 *
 * Live-ness is now derived, never stored:
 *   • single station  → harbor `source`, the authority (StationStatusService)
 *   • fan-out queries → an open StreamSession (ended_at IS NULL), the same
 *     normalised record we already keep for billing, written by the same
 *     MediaMTX webhooks that used to write this column.
 *
 * `desired_state` stays. It is intent, not observation: it has to outlive the
 * container it describes, which is precisely what harbor cannot do.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropIndex(['is_live']);
            $table->dropColumn('is_live');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->boolean('is_live')->default(false)->after('artwork_url');
            $table->index('is_live');
        });
    }
};
