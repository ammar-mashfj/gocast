<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which audio path the station's CURRENT run uses: `container` (a Liquidsoap
 * container, as every station had until now) or `relay` (the browser's MP3
 * passed straight to Icecast by the relay — Free plan only). See
 * docs/RELAY-SERVICE-PLAN.md.
 *
 * Decided once, when the station starts, and cleared when it stops, so an
 * upgrade or a config change mid-show never switches the path under a live
 * broadcaster. Null means "not running" and, for rows that were already
 * running when this deployed, "container" — which is what they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('stations', 'ingest_path')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->string('ingest_path', 16)->nullable()->after('desired_state');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('stations', 'ingest_path')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('ingest_path');
        });
    }
};
