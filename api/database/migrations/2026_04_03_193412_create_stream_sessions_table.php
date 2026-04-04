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
        Schema::create('stream_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('peak_listeners')->default(0);
            $table->unsignedInteger('total_listener_minutes')->default(0);
            $table->enum('source_type', ['browser', 'electron', 'external'])->default('browser');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stream_sessions');
    }
};
