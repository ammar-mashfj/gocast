<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Jingle lists: Station IDs, Sweepers, Promos… each with one rule.
 *
 *   "Play a [pick] jingle from [this list] [how often], [when]."
 *
 * Laravel decides when a jingle plays (AutoDjScheduler, at each track
 * boundary) and Liquidsoap just plays what next-track hands it. Before this,
 * the rule lived in the .liq as one per-station setting (stations.jingle_*)
 * over one jingles.m3u.
 *
 * Its own table rather than a `kind` on playlists: a jingle list carries a
 * rule a music playlist never has, and a music playlist is read in places
 * (the schedule, the library, the default) where a jingle list must never
 * turn up.
 *
 * Each jingle belongs to one list (tracks.jingle_list_id), played in
 * tracks.position order when the list is "in order".
 *
 * The data step gives every station that has jingles one "Jingles" list
 * holding all of them, with its current rule copied: same switch, same
 * every-N-minutes or every-N-tracks, random pick. Listeners hear no change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('jingle_lists', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUuid('station_id')->constrained('stations')->cascadeOnDelete();
            $table->string('name', 60);
            $table->boolean('enabled')->default(true);

            // random | in_order | single
            $table->string('pick', 16)->default('random');
            // Deleting the pinned clip unpins it; the list then plays its first.
            $table->foreignUlid('pinned_track_id')->nullable()->constrained('tracks')->nullOnDelete();

            // minutes | songs | times
            $table->string('frequency', 16)->default('songs');
            $table->unsignedInteger('every_minutes')->nullable();
            $table->unsignedInteger('every_songs')->nullable();
            // ["08:00", "20:30"], wall clocks in the station's timezone.
            $table->json('times')->nullable();
            // At set times: fade the song so the jingle is exactly on time.
            $table->boolean('exact')->default(false);

            // Null days = every day; null from/to = all day. to <= from runs
            // past midnight, as for AutoDJ slots.
            $table->json('days')->nullable();
            $table->time('from_time')->nullable();
            $table->time('to_time')->nullable();

            $table->unsignedInteger('position')->default(0);

            // Rotation state, written with the query builder at boundaries.
            $table->json('deck')->nullable();
            $table->unsignedInteger('cursor_position')->nullable();
            $table->unsignedInteger('songs_since')->default(0);
            $table->timestamp('last_played_at', 3)->nullable();

            $table->timestamps();

            $table->index(['station_id', 'position']);
        });

        Schema::table('tracks', function (Blueprint $table) {
            $table->foreignUlid('jingle_list_id')->nullable()->after('kind')
                ->constrained('jingle_lists')->nullOnDelete();
        });

        $now = now();

        $stations = DB::table('stations')
            ->whereExists(fn ($q) => $q->from('tracks')
                ->whereColumn('tracks.station_id', 'stations.id')
                ->where('tracks.kind', 'jingle'))
            ->get(['id', 'jingles_enabled', 'jingle_mode', 'jingle_interval_seconds', 'jingle_every_tracks']);

        foreach ($stations as $station) {
            $byTracks = $station->jingle_mode === 'tracks';
            $id = (string) Str::ulid();

            DB::table('jingle_lists')->insert([
                'id' => $id,
                'station_id' => $station->id,
                'name' => 'Jingles',
                'enabled' => (bool) $station->jingles_enabled,
                'pick' => 'random',
                'frequency' => $byTracks ? 'songs' : 'minutes',
                'every_minutes' => $byTracks ? null : max(1, (int) round(((int) $station->jingle_interval_seconds) / 60)),
                'every_songs' => $byTracks ? max(1, (int) $station->jingle_every_tracks) : null,
                'position' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('tracks')
                ->where('station_id', $station->id)
                ->where('kind', 'jingle')
                ->update(['jingle_list_id' => $id]);
        }
    }

    public function down(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('jingle_list_id');
        });

        Schema::dropIfExists('jingle_lists');
    }
};
