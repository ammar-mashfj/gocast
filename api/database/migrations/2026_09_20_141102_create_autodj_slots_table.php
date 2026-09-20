<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Play playlist P on these weekdays from HH:MM to HH:MM."
 *
 * Read by the audio path: AutoDjScheduler asks AutoDjProgramme which slot
 * is active at every track boundary and walks that slot's playlist. Outside
 * every slot the station's default playlist plays.
 *
 * NOT `station_schedules`. That table is the owner's advertised show times —
 * a display claim about when a human is live, deliberately read by nothing
 * that decides what plays. The two share a station and a timezone and
 * nothing else; see docs/AUTODJ-SCHEDULING-PLAN.md §0.
 *
 * Unlike a show time, a slot has an END: it is a window, because "what plays
 * now" has to be answerable. `end_time <= start_time` means the window runs
 * past midnight into the next day. `days` are the weekdays the slot STARTS
 * on (0 = Sunday, Carbon's dayOfWeek), so a Friday 22:00–02:00 slot is one
 * row under Friday.
 *
 * Both times are wall clocks in `stations.timezone`. 06:00 stays 06:00
 * through a DST change, which is what an owner means by six o'clock; the
 * instants are computed at read time.
 *
 * Overlaps are refused at write time (ReplaceAutodjSlotsRequest), so at most
 * one slot is ever active and the resolver never has to rank them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('autodj_slots', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUuid('station_id')
                ->constrained('stations')
                ->cascadeOnDelete();
            // Deleting a playlist deletes the slots that play it: a slot with
            // nothing to play is a silent hour nobody asked for.
            $table->foreignUlid('playlist_id')
                ->constrained('playlists')
                ->cascadeOnDelete();

            $table->string('label', 60)->nullable();
            $table->json('days');
            $table->time('start_time');
            $table->time('end_time');

            // Display order in the editor, owner-controlled.
            $table->unsignedInteger('position')->default(0);

            $table->timestamps();

            $table->index(['station_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('autodj_slots');
    }
};
