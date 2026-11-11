<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The owner's choice of how AutoDJ moves from one song to the next: blended
 * (true) or a hard cut. On by default, existing stations included. It only
 * takes effect while LIQUIDSOAP_CROSSFADE_ENABLED is on, which stays the
 * install-wide switch for turning crossfade off everywhere at once. Pushed
 * into the running container live, so changing it never restarts anything.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('stations', 'crossfade_enabled')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->boolean('crossfade_enabled')->default(true)->after('jingles_enabled');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('stations', 'crossfade_enabled')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('crossfade_enabled');
        });
    }
};
