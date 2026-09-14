<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            // How AutoDjScheduler walks the rotation.
            //
            //   sequential — `position` order, top to bottom, wrapping at the
            //                end. What every station did before this column,
            //                and what the drag handles in the library exist to
            //                control.
            //   shuffle    — a random permutation of the whole rotation, played
            //                through to the end before another is dealt.
            //
            // Defaulting to sequential is what makes this migration a no-op
            // for existing stations: nothing about their audio changes until
            // an owner flips the setting.
            $table->string('autodj_order', 16)->default('sequential')->after('autodj_cursor_position');

            // The remaining, unplayed half of the current shuffle — track IDs
            // in the order they will air. Only read in shuffle mode.
            //
            // Null means "no deck dealt yet", which is both the state of every
            // existing row and the state a station lands in the first time it
            // is switched to shuffle. AutoDjScheduler treats null and [] the
            // same way: deal a fresh one.
            //
            // It holds IDs rather than positions deliberately. Positions are
            // renumbered on every reorder, so a deck of positions would
            // silently re-point at different songs when the owner drags a row;
            // a deck of IDs is simply unaffected, which is the correct
            // behaviour when the running order is random anyway.
            $table->json('autodj_deck')->nullable()->after('autodj_order');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['autodj_order', 'autodj_deck']);
        });
    }
};
