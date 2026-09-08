<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * May this plan's stations be embedded on third-party sites?
 *
 * One boolean per feature, matching `autodj_enabled`. Unlike `analytics_days`
 * there is no quantity to express — a station is embeddable or it is not.
 *
 * This gates the EMBED PAGE ITSELF, not just the snippet in the dashboard.
 * `GET /public/stations/{slug}/embed` reads the owner's plan and answers 404
 * for a plan without it, so a free owner cannot get an embed by guessing the
 * URL, and a Pro owner who downgrades has every embed already pasted onto
 * other people's sites go dark at the same moment. That last part is the
 * decided behaviour, not an accident (2026-09-08).
 *
 * The audio itself is NOT gated here — the HLS and Icecast URLs are public
 * and were before this column existed. What is gated is the player chrome
 * that makes those URLs usable on someone else's page without a
 * frame-busting header in the way.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->boolean('embed_enabled')->default(false)->after('analytics_days');
        });

        DB::table('plans')->where('slug', 'free')->update(['embed_enabled' => false]);

        DB::table('plans')->where('slug', 'pro')->update(['embed_enabled' => true]);

        // Any tier seeded later (starter/studio): paid is paid, matching how
        // autodj_enabled and analytics_days were handled.
        DB::table('plans')->whereNotIn('slug', ['free', 'pro'])->update(['embed_enabled' => true]);
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('embed_enabled');
        });
    }
};
