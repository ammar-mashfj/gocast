<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether the public player (station page and embed) shows "N listening".
 * On by default, existing stations included, so nothing changes until an
 * owner turns it off. Off hides the figure from the public listeners
 * endpoint itself, not just the player: the endpoint is open to anyone.
 *
 * Not hidden: Icecast's own status page lists every mount with its listener
 * count, so a station on the relay path still shows a figure there. Accepted.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('stations', 'show_listener_count')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->boolean('show_listener_count')->default(true)->after('crossfade_enabled');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('stations', 'show_listener_count')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('show_listener_count');
        });
    }
};
