<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How far back a plan may look at its own audience.
 *
 * ONE COLUMN RATHER THAN A FLAG PLUS A NUMBER, because a boolean and a range
 * can disagree — `analytics_enabled = false, analytics_days = 90` has no
 * meaning, and something would eventually have to decide which half wins.
 * Zero says "live figures only" and any positive number says both that the
 * feature is on and how much of it there is.
 *
 * COLLECTION IS NOT GATED AND MUST NEVER BE. Every station on every plan has
 * been accumulating listener_stats_hourly and listener_geo_daily since those
 * tables shipped, and `listeners:sweep` does not know what a plan is. This
 * column gates DISPLAY only, which is what makes an upgrade instant: a free
 * station that upgrades sees ninety days of its own history immediately
 * rather than starting a clock.
 *
 * 90 matches `analytics.retention_days`. The two are related on purpose — the
 * per-country and per-device breakdowns are computed from raw
 * `listener_sessions`, so a window wider than retention would show real
 * history for listening time and empty columns beside it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedSmallInteger('analytics_days')->default(0)->after('autodj_enabled');
        });

        // Free keeps what it already had on the station page — listeners right
        // now, and the all-time peak. Both are live figures that cost one Redis
        // read and one aggregate, and neither is history.
        DB::table('plans')->where('slug', 'free')->update(['analytics_days' => 0]);

        DB::table('plans')->where('slug', 'pro')->update(['analytics_days' => 90]);

        // Any tier seeded later (starter/studio) gets the full window, matching
        // how autodj_enabled was handled: paid is paid.
        DB::table('plans')->whereNotIn('slug', ['free', 'pro'])->update(['analytics_days' => 90]);
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('analytics_days');
        });
    }
};
