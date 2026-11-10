<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A per-station storage cap, set by an admin for a customer who needs more
 * room than everyone else. Null means "the install default"
 * (`liquidsoap.station_storage_bytes`) — existing rows are NOT backfilled,
 * so a change to the env still reaches every station without an override.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('stations', 'storage_cap_bytes')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->unsignedBigInteger('storage_cap_bytes')->nullable()->after('featured_at');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('stations', 'storage_cap_bytes')) {
            return;
        }

        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('storage_cap_bytes');
        });
    }
};
