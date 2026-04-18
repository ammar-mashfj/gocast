<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tracks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();
            $table->string('title', 255);
            $table->string('artist', 255)->default('Unknown');
            $table->decimal('duration', 10, 3);
            $table->string('file_path');
            $table->unsignedBigInteger('file_size');
            $table->string('mime_type', 100)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['station_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tracks');
    }
};
