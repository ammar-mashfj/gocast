<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Plan limits for the two resources a station actually consumes.
 *
 * `max_running_stations` is the one that matters operationally: a running
 * station holds a Liquidsoap container (memory + cpu) whether or not anyone
 * is listening, so concurrency — not the number of station rows — is what
 * bounds how many accounts fit on a box.
 *
 * `autodj_enabled` gates the track library. Free stations can broadcast live
 * but not run an unattended playlist, which is the paid-tier hook.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('max_running_stations')->default(1)->after('max_stations');
            $table->boolean('autodj_enabled')->default(false)->after('max_listeners');

            // Hours a station may sit on air with no listeners and no
            // broadcaster before `stations:reap-idle` takes it off air.
            // 0 = never reap (paid tiers stay up); null = fall back to the
            // LIQUIDSOAP_IDLE_STOP_HOURS default.
            $table->unsignedInteger('idle_stop_hours')->nullable()->after('autodj_enabled');
        });

        DB::table('plans')->where('slug', 'free')->update([
            'max_running_stations' => 1,
            'autodj_enabled' => false,
            'idle_stop_hours' => 2,
        ]);

        DB::table('plans')->where('slug', 'pro')->update([
            'max_running_stations' => 5,
            'autodj_enabled' => true,
            'idle_stop_hours' => 0,
        ]);

        // Any plan seeded later (starter/studio) keeps the column defaults
        // until it is configured explicitly.
        DB::table('plans')->whereNotIn('slug', ['free', 'pro'])->update([
            'max_running_stations' => DB::raw('max_stations'),
            'autodj_enabled' => true,
            'idle_stop_hours' => 0,
        ]);
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn(['max_running_stations', 'autodj_enabled', 'idle_stop_hours']);
        });
    }
};
