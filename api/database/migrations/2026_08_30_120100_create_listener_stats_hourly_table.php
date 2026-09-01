<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listener_stats_hourly', function (Blueprint $table) {
            // The permanent half of listener analytics. `listener_sessions` is
            // pruned after 90 days; this is not, so everything the dashboard
            // shows beyond that window has to be summarised here BEFORE the
            // raw rows expire.
            $table->id();

            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();

            // Truncated to the hour, always UTC. Timezone conversion is the
            // reader's job — storing local hours makes a station that moves
            // country, or a DST boundary, silently corrupt the series.
            $table->timestamp('hour');

            // ---- Written every minute by `listeners:sweep` ----------------
            //
            // Concurrency can't be recovered from session rows cheaply: you'd
            // have to replay every overlapping start and end on a timeline.
            // So it's sampled instead — once a minute, which is exactly the
            // cadence the scheduler already runs at.

            /** Highest concurrent listener count seen in any sample this hour. */
            $table->unsignedInteger('peak_listeners')->default(0);

            /**
             * Sum of the per-minute concurrency samples. Because the samples
             * are one minute apart, this IS listener-minutes for the hour —
             * summing "how many people are listening right now" once a minute
             * gives you total listening time for free, with no session
             * arithmetic involved. It is also the only listening-time figure
             * that covers Icecast listeners, who never open a session row.
             */
            $table->unsignedInteger('listener_minutes')->default(0);

            /**
             * How many of the hour's 60 minutes actually produced a sample
             * with someone listening. Two uses: average concurrency while
             * anyone was there is `listener_minutes / sampled_minutes`, while
             * average across the whole hour is `listener_minutes / 60`. It
             * also exposes a scheduler that stopped running, which would
             * otherwise look exactly like an hour with no audience.
             */
            $table->unsignedSmallInteger('sampled_minutes')->default(0);

            // ---- Backfilled once, after the hour closes, by `listeners:rollup`

            /** Sessions whose `started_at` fell in this hour. */
            $table->unsignedInteger('sessions_started')->default(0);

            /** Distinct `visitor_hash` values among those sessions. */
            $table->unsignedInteger('unique_listeners')->default(0);

            /**
             * Of those sessions, how many lasted past
             * `analytics.min_listen_seconds`. The difference between this and
             * `sessions_started` is your bounce rate — people who pressed play
             * and left before the stream was worth counting.
             */
            $table->unsignedInteger('qualified_listens')->default(0);

            // Rows are created by an upsert racing against itself across
            // stations, so uniqueness is enforced here rather than by reading
            // first. Doubles as the index every read uses.
            $table->unique(['station_id', 'hour']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listener_stats_hourly');
    }
};
