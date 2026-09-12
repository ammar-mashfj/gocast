<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a station's broadcaster says they are usually on.
 *
 * This is a CLAIM, not an instruction. Nothing reads it to decide what plays
 * or when a container runs — AutoDjScheduler and desired_state are untouched.
 * It exists so a listener who arrives once can find out when to come back,
 * which is the one thing the product could not express at all: the only
 * forward-looking signal was a notify-me box that renders solely on the
 * off-air branch of the player, i.e. never on a paid station running AutoDJ.
 *
 * A row is a START, not a window. There is no end time on purpose:
 *
 *  • "Is the show on right now" is already answered, correctly, by an open
 *    StreamSession (StationResource's `is_live`). A window would be a second,
 *    guessable answer to a question the stream itself knows.
 *  • A start time cannot cross midnight, so `Sun 22:00` needs no rule about
 *    which day it belongs to and no `end < start` special case at any read
 *    site.
 *  • It is the claim most likely to stay true. Shows run long; "I go on at
 *    ten" survives that, "I'm on ten til two" does not — and the standing
 *    weakness of DJ-authored data is that it decays into a lie in silence.
 *
 * `days` holds the weekdays the show STARTS (0 = Sunday, matching Carbon's
 * dayOfWeek), as JSON because nothing ever queries into it: the rows are read
 * whole, for one station, and rendered.
 *
 * `start_time` is a wall clock in `stations.timezone` — 20:00 stays 20:00
 * through a DST change, which is what a DJ means by "eight o'clock". The
 * instant it corresponds to this week is computed at read time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('station_schedules', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();

            // Optional because a one-row station is just "Fridays at 8" and
            // naming it adds nothing. It earns its place the moment there are
            // two rows, which by definition means two different shows — the
            // same show on several days is one row with several days.
            $table->string('label', 60)->nullable();

            $table->json('days');
            $table->time('start_time');

            // Display order, owner-controlled. Not a sort by time: a DJ may
            // want the flagship show first regardless of when it airs.
            $table->unsignedInteger('position')->default(0);

            $table->timestamps();

            $table->index(['station_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('station_schedules');
    }
};
