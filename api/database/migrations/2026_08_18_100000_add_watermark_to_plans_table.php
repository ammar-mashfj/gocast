<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The audible free-tier marker: a short platform-owned clip that ducks the
 * station and identifies GoCast, every few minutes.
 *
 * It is a PLAN column rather than a station column on purpose. Nothing about
 * it may be reachable from the station update endpoint — a free user must not
 * be one PATCH away from switching off the thing they are meant to pay to
 * remove. Changing plans is the only way it moves.
 *
 * Note what this actually watermarks. Free plans have `autodj_enabled = false`,
 * so a free station has no track library and its AutoDJ is silence: in practice
 * this rides over LIVE broadcasts, i.e. over someone talking. That is why it
 * ducks rather than interrupts, and why it sits after the live/AutoDJ fallback
 * — applied any earlier, going live would evade it, and going live is the only
 * thing a free station can do.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            // Defaults to FALSE, and the asymmetry is deliberate: silently
            // watermarking a paying customer is a much worse failure than
            // silently not watermarking a free one, so a plan added later has
            // to opt in explicitly rather than inherit it.
            $table->boolean('watermark_enabled')->default(false)->after('autodj_enabled');
        });

        DB::table('plans')->where('slug', 'free')->update(['watermark_enabled' => true]);
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('watermark_enabled');
        });
    }
};
