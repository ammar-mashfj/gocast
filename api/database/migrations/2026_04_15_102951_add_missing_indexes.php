<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->index('user_id');
            $table->index('is_live');
        });

        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->index('station_id');
            $table->index('ended_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
            $table->dropIndex(['is_live']);
        });

        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->dropIndex(['station_id']);
            $table->dropIndex(['ended_at']);
        });
    }
};
