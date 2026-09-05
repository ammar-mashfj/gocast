<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Bring the plan rows into line with what the site has been saying.
 *
 * The original plans migration seeded Free at 25 listeners and Pro at 500,
 * and those figures were never revisited when pricing settled on 100 / 1,000
 * (see PricingSection and the blog). Nothing enforces `max_listeners` yet —
 * no Icecast or Liquidsoap limit reads it — so the only place the stale
 * numbers surfaced was the Pro-granted email, which told a station it could
 * take "up to 500 listeners" right after the pricing page promised 1,000.
 *
 * Keyed by slug rather than id, matching the analytics_days migration: the
 * ids are seeded but a deployment that re-created the rows by hand would
 * still get the right values.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('plans')->where('slug', 'free')->update(['max_listeners' => 100]);
        DB::table('plans')->where('slug', 'pro')->update(['max_listeners' => 1000]);
    }

    public function down(): void
    {
        DB::table('plans')->where('slug', 'free')->update(['max_listeners' => 25]);
        DB::table('plans')->where('slug', 'pro')->update(['max_listeners' => 500]);
    }
};
