<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop a column that was declared, cast on the model, rendered in the
     * frontend interface — and never written by anything. Every listening-hours
     * figure sourced from it has been a hard-coded zero since the table was
     * created.
     *
     * It is dropped rather than backfilled because the question it was asking
     * now has a real answer somewhere else: `listener_stats_hourly.listener_minutes`
     * measures listening time for the whole station, including AutoDJ hours and
     * Icecast listeners, neither of which a broadcaster-scoped column could ever
     * have seen.
     */
    public function up(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->dropColumn('total_listener_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->unsignedInteger('total_listener_minutes')->default(0);
        });
    }
};
