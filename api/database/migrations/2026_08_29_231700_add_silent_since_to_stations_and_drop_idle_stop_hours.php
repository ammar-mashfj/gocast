<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Moves station auto-stop from "nobody is listening" to "nothing is playing".
 *
 * `stations.silent_since` replaces the `station-idle-since:` cache key the old
 * idle reaper used. A cache key was the wrong home for it: a Redis flush or an
 * eviction reset every station's clock, and the marker had to carry a TTL to
 * avoid leaking keys for deleted stations. A column is persisted, is dropped
 * with the row it belongs to, and — the reason that actually matters — cannot
 * disagree with the station it describes. Same argument the silent-station
 * policy already makes for reading `stream_sessions.ended_at`.
 *
 * `plans.idle_stop_hours` goes because listener count no longer decides
 * anything. It only ever produced the right answer by accident: it reaped free
 * stations because free has no AutoDJ, so "no listeners" happened to coincide
 * with "no broadcaster". Enable AutoDJ on free, or set a non-zero window on a
 * paid plan, and it would have taken stations off air mid-playback. Leaving the
 * column in place would leave that switch sitting there to be flipped.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            // When this station was first OBSERVED producing no audio with
            // nothing attached to produce any. Null means "not on the clock":
            // either it is doing something, or it has not been observed yet.
            //
            // Only ever written from an observation where the container
            // actually answered — a booting or unreachable container must not
            // start the clock, or a slow start on a busy daemon would count as
            // silence and stop a station that never got to play anything.
            $table->timestamp('silent_since')->nullable()->after('started_at');
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('idle_stop_hours');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('silent_since');
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('idle_stop_hours')->nullable()->after('autodj_enabled');
        });
    }
};
