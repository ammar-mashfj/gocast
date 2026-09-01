<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listener_geo_daily', function (Blueprint $table) {
            // Country history outlives the raw sessions it was derived from.
            // Without this table "where were my listeners?" only reaches back
            // as far as `analytics.retention_days`; with it, the answer is
            // permanent and costs about twenty rows per station per day.
            $table->id();

            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();

            // Attributed to the day the session STARTED, so a show that runs
            // through midnight stays in one day rather than being split. Same
            // convention the broadcast activity chart already uses.
            $table->date('day');

            $table->char('country', 2);

            $table->unsignedInteger('sessions')->default(0);
            $table->unsignedBigInteger('listener_seconds')->default(0);

            $table->unique(['station_id', 'day', 'country']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listener_geo_daily');
    }
};
