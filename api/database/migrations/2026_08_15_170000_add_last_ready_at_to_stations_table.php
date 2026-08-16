<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a station's container last reported that Icecast accepted its source —
 * i.e. the last moment we know listeners could hear it.
 *
 * `started_at` records when somebody asked for the station to be on air, which
 * is intent and says nothing about whether it worked. Until now there was no
 * record of a start ever SUCCEEDING, so "started 20 minutes ago and never came
 * up" was indistinguishable from "started 20 minutes ago and is fine" without
 * asking the container.
 *
 * Written by the container's own lifecycle push (StationEventController), so a
 * lost event costs freshness and nothing else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->timestamp('last_ready_at')->nullable()->after('started_at');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('last_ready_at');
        });
    }
};
