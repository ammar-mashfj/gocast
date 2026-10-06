<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hard starts for AutoDJ slots, and the state Laravel needs now that it
 * decides when a jingle plays (it used to be Liquidsoap's call).
 *
 *   autodj_slots.start_mode — `soft` lets the song playing at the slot's start
 *       finish (what every slot did before this); `hard` starts the slot on
 *       time, picking songs that fit before it and fading one only when none
 *       does. See AutoDjScheduler.
 *
 *   stations.jingle_times — minutes past the hour for the `times` jingle mode.
 *
 *   stations.autodj_last_jingle_at / _id / autodj_songs_since_jingle — the
 *       jingle clock. Written with the query builder at track boundaries, like
 *       the playlist cursor, so StationObserver never sees them. They hold
 *       when the last jingle was planned to start, which one it was (so the
 *       same ID is not picked twice running), and how many songs have been
 *       handed out since.
 *
 *   stations.autodj_queued_at / _start / _airtime — the last track handed
 *       out: when, when it was expected to start (in the container's own
 *       timeline), and for how long it plays. Only read when the container
 *       asks again within a couple of seconds, which happens when Liquidsoap
 *       re-asks while the first answer is still loading: the new answer
 *       plays after that one, not after the track on air.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded: a development database migrated from another branch can
        // already have a start_mode column of this exact shape.
        if (! Schema::hasColumn('autodj_slots', 'start_mode')) {
            Schema::table('autodj_slots', function (Blueprint $table) {
                $table->string('start_mode', 8)->default('soft')->after('end_time');
            });
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->json('jingle_times')->nullable()->after('jingle_every_tracks');
            $table->dateTime('autodj_last_jingle_at', 3)->nullable()->after('autodj_last_playlist_id');
            $table->char('autodj_last_jingle_id', 26)->nullable()->after('autodj_last_jingle_at');
            $table->unsignedInteger('autodj_songs_since_jingle')->default(0)->after('autodj_last_jingle_id');
            $table->dateTime('autodj_queued_at', 3)->nullable()->after('autodj_songs_since_jingle');
            $table->dateTime('autodj_queued_start', 3)->nullable()->after('autodj_queued_at');
            $table->double('autodj_queued_airtime')->nullable()->after('autodj_queued_start');
        });
    }

    public function down(): void
    {
        // Leave start_mode to the other branch's migration when that one
        // created it (the guard in up() skipped it here).
        $ownedElsewhere = DB::table('migrations')
            ->where('migration', '2026_10_05_130000_add_start_mode_to_autodj_slots_table')
            ->exists();

        if (! $ownedElsewhere && Schema::hasColumn('autodj_slots', 'start_mode')) {
            Schema::table('autodj_slots', function (Blueprint $table) {
                $table->dropColumn('start_mode');
            });
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn([
                'jingle_times',
                'autodj_last_jingle_at',
                'autodj_last_jingle_id',
                'autodj_songs_since_jingle',
                'autodj_queued_at',
                'autodj_queued_start',
                'autodj_queued_airtime',
            ]);
        });
    }
};
