<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            // Off for every existing station: uploading jingles must not
            // silently start interrupting a rotation somebody already tuned.
            $table->boolean('jingles_enabled')->default(false);

            // Minimum wall-clock gap between two jingles. Liquidsoap renders
            // this into `delay(...)`, which holds the jingle source
            // unavailable for this long after each jingle ends — so it is a
            // floor, not a schedule: the jingle plays at the first track
            // boundary AFTER the interval elapses, never mid-song.
            //
            // 30 minutes is the common "station ID twice an hour" default.
            $table->unsignedInteger('jingle_interval_seconds')->default(1800);
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['jingles_enabled', 'jingle_interval_seconds']);
        });
    }
};
