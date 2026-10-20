<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A colour the owner picks for a playlist, as `#rrggbb`. Display only: it
 * paints the playlist's slots on the schedule and its dot in lists. Null
 * means "automatic" — the client falls back to a shade by position.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('playlists', 'color')) {
            return;
        }

        Schema::table('playlists', function (Blueprint $table) {
            $table->string('color', 7)->nullable()->after('order');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('playlists', 'color')) {
            return;
        }

        Schema::table('playlists', function (Blueprint $table) {
            $table->dropColumn('color');
        });
    }
};
