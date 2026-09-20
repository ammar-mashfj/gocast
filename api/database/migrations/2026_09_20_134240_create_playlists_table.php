<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A named, ordered subset of a station's music tracks with its own play
 * order and its own place in the rotation.
 *
 * Until this table, a station had exactly one rotation — the whole library
 * in `tracks.position` order — and the state of that rotation lived on the
 * station row (`autodj_order`, `autodj_cursor_position`, `autodj_deck`).
 * Scheduling needs more than one rotation per station, so those three
 * columns move here, one row per rotation. See
 * docs/AUTODJ-SCHEDULING-PLAN.md.
 *
 * Every station has exactly one row with `is_default` set. It cannot be
 * deleted; it is what plays whenever nothing else is scheduled, and for
 * every station that existed before this table it IS the old rotation —
 * the backfill migration copies the cursor and the deck across so nothing
 * changes on air.
 *
 * `cursor_position` refers to `playlist_track.position`, not
 * `tracks.position`: each playlist numbers its own members. `deck` holds
 * track IDs for the same reason `stations.autodj_deck` did — positions are
 * renumbered on reorder, IDs are not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('playlists', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUuid('station_id')
                ->constrained('stations')
                ->cascadeOnDelete();

            $table->string('name', 60);
            $table->boolean('is_default')->default(false);

            // sequential | shuffle — the two values `stations.autodj_order`
            // held, with the same meaning (see Playlist::ORDER_*).
            $table->string('order', 16)->default('sequential');

            // Sequential mode: pivot position of the track last handed out.
            // Null = never played; the first request starts at the top.
            $table->unsignedInteger('cursor_position')->nullable();

            // Shuffle mode: the unplayed remainder of the current cycle, as
            // track IDs in the order they will air. Null and [] both mean
            // "deal a fresh one".
            $table->json('deck')->nullable();

            // Display order in the owner's list. The default playlist is
            // always shown first regardless, so this only orders the rest.
            $table->unsignedInteger('position')->default(0);

            $table->timestamps();

            $table->index(['station_id', 'position']);
            $table->unique(['station_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('playlists');
    }
};
