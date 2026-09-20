<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which playlist the rotation last drew from, so AutoDjScheduler can write a
 * `playlist_changed` event to the station timeline the first time a track
 * boundary lands in a different one.
 *
 * Monitoring state, nothing else: no product logic reads it (see the
 * station_events rule). Written with the query builder at track boundaries,
 * like the cursor used to be, so StationObserver never fires for it. No
 * foreign key on purpose — a deleted playlist must not cascade into a
 * station row, and a stale id here just means the next boundary records a
 * switch.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->char('autodj_last_playlist_id', 26)->nullable()->after('desired_state');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('autodj_last_playlist_id');
        });
    }
};
