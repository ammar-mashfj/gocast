<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * When a station was put in the featured rail.
 *
 * The `featured` boolean says whether a station is curated; it cannot say in
 * what order. /public/featured takes four rows, so with five featured stations
 * the one left out was whatever the storage engine happened to return last —
 * and it could differ between two requests a second apart. This column is the
 * tiebreak, and it doubles as "featured since" in the admin panel.
 *
 * Nullable rather than defaulted: a station that has never been featured has
 * no date, and `featured = false` with a stale timestamp would be a lie the
 * next reader has to decode.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->timestamp('featured_at')->nullable()->after('featured')->index();
        });

        // Anything already featured predates this column. Backfilling to the
        // row's own updated_at keeps the existing rail in a stable order from
        // the first request after deploy, rather than sorting every existing
        // pick behind the first one somebody touches afterwards.
        DB::table('stations')
            ->where('featured', true)
            ->whereNull('featured_at')
            ->update(['featured_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('featured_at');
        });
    }
};
