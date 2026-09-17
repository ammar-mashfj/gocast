<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * May this plan's stations be broadcast to from an external encoder?
 *
 * One boolean per feature, exactly like `embed_enabled` beside it. What it
 * gates is the station's STREAM KEY — the long-lived credential BUTT, Mixxx,
 * RadioDJ and anything else speaking the Icecast source protocol authenticate
 * with.
 *
 * As with the embed, the gate is enforced where the credential is checked
 * (HarborAuthController), not only where it is displayed. A Pro user who
 * downgrades keeps a key that no longer opens anything: their next connection
 * attempt is refused, and a broadcast already in flight runs to its end
 * because harbor authenticates at connect time only.
 *
 * The browser studio is NOT gated here and never should be. It authenticates
 * with a 60-second token from BroadcastTokenService, is on every plan, and is
 * how a free account goes live.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->boolean('encoder_enabled')->default(false)->after('embed_enabled');
        });

        DB::table('plans')->where('slug', 'free')->update(['encoder_enabled' => false]);

        DB::table('plans')->where('slug', 'pro')->update(['encoder_enabled' => true]);

        // Any tier seeded later (starter/studio): paid is paid, matching how
        // embed_enabled, autodj_enabled and analytics_days were handled.
        DB::table('plans')->whereNotIn('slug', ['free', 'pro'])->update(['encoder_enabled' => true]);
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('encoder_enabled');
        });
    }
};
