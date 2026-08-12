<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tracks', function (Blueprint $table) {
            $table->ulid('id')->primary();

            // The track is bound to its station — when the station is deleted
            // we also wipe its playlist directory and these rows go with it.
            $table->foreignUuid('station_id')
                ->constrained('stations')
                ->cascadeOnDelete();

            // On-disk filename (relative to the station's playlist dir).
            // We rename uploads to "{id}.{ext}" so concurrent uploads can't
            // collide and so the file path is stable across user-edits to
            // the displayed title/artist.
            $table->string('path');
            $table->string('original_filename');

            // Tag-derived metadata, user-editable. Falls back to filename
            // when ID3 read fails or the file has no tags.
            $table->string('title');
            $table->string('artist')->nullable();

            // Cached at upload time — used for total-airtime calculations
            // and the m3u EXTINF line. Float to support sub-second decimals.
            $table->float('duration_seconds')->default(0);
            $table->unsignedBigInteger('file_size_bytes');

            // Manual ordering inside the station's playlist. Reorder rewrites
            // these positions to gap-free sequential ints; new uploads land
            // at max(position) + 1.
            $table->unsignedInteger('position');

            $table->timestamps();

            $table->index(['station_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tracks');
    }
};
