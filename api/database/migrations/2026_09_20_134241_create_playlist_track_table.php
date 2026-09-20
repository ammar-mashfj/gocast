<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which tracks are in which playlist, and in what order.
 *
 * A pivot rather than a `playlist_id` on `tracks`, because a song belonging
 * to both "Daytime" and "Weekend" is ordinary radio programming, and a
 * single foreign key would make the owner upload the file twice against
 * their quota to get it.
 *
 * `position` is 1-based and gap-free PER PLAYLIST — the same contract
 * `tracks.position` keeps per (station, kind), maintained by the same
 * compact-on-remove logic (PlaylistTracks). `tracks.position` itself stays:
 * it still orders the library view and the jingle list, it just no longer
 * decides what plays.
 *
 * Only music tracks belong here. Jingles have their own arm in the audio
 * graph and are refused at validation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('playlist_track', function (Blueprint $table) {
            $table->foreignUlid('playlist_id')
                ->constrained('playlists')
                ->cascadeOnDelete();
            $table->foreignUlid('track_id')
                ->constrained('tracks')
                ->cascadeOnDelete();

            $table->unsignedInteger('position');

            $table->primary(['playlist_id', 'track_id']);
            $table->index(['playlist_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('playlist_track');
    }
};
