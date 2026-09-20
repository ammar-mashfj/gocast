<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Turn every station's existing rotation into its default playlist.
 *
 * Data only — the tables come from the two migrations before this one and
 * the old columns go in the one after, so that `down()` here has somewhere
 * to copy the state back to.
 *
 * Query builder throughout, never a model: `StationObserver` re-renders the
 * .liq and restarts the container on some station writes, and this must
 * touch nothing on the `stations` row anyway. It also has to reach
 * soft-deleted stations, which a model query would hide — a restored
 * station gets its library back, so it must get its playlist back too.
 *
 * Idempotent: a station that already has a default playlist is skipped, so
 * a partial run can be repeated.
 */
return new class extends Migration
{
    private const DEFAULT_NAME = 'Main rotation';

    public function up(): void
    {
        // Fresh installs (and the test database) run this against a schema
        // where the columns still exist but no rows do, so this guard is
        // only for re-running after the drop migration has already gone.
        if (! Schema::hasColumn('stations', 'autodj_order')) {
            return;
        }

        $now = now();

        DB::table('stations')
            ->select(['id', 'autodj_order', 'autodj_cursor_position', 'autodj_deck'])
            ->orderBy('id')
            ->chunk(100, function ($stations) use ($now) {
                foreach ($stations as $station) {
                    $exists = DB::table('playlists')
                        ->where('station_id', $station->id)
                        ->where('is_default', true)
                        ->exists();

                    if ($exists) {
                        continue;
                    }

                    $playlistId = (string) Str::ulid();

                    DB::table('playlists')->insert([
                        'id' => $playlistId,
                        'station_id' => $station->id,
                        'name' => self::DEFAULT_NAME,
                        'is_default' => true,
                        'order' => $station->autodj_order ?? 'sequential',
                        'cursor_position' => $station->autodj_cursor_position,
                        // Already a JSON string on the row; copied as-is.
                        'deck' => $station->autodj_deck,
                        'position' => 0,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);

                    $members = DB::table('tracks')
                        ->where('station_id', $station->id)
                        ->where('kind', 'music')
                        ->orderBy('position')
                        ->get(['id', 'position'])
                        ->map(fn ($track) => [
                            'playlist_id' => $playlistId,
                            'track_id' => $track->id,
                            'position' => $track->position,
                        ])
                        ->all();

                    foreach (array_chunk($members, 500) as $chunk) {
                        DB::table('playlist_track')->insert($chunk);
                    }
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('stations', 'autodj_order')) {
            DB::table('playlists')
                ->where('is_default', true)
                ->orderBy('id')
                ->chunk(100, function ($playlists) {
                    foreach ($playlists as $playlist) {
                        DB::table('stations')
                            ->where('id', $playlist->station_id)
                            ->update([
                                'autodj_order' => $playlist->order,
                                'autodj_cursor_position' => $playlist->cursor_position,
                                'autodj_deck' => $playlist->deck,
                            ]);
                    }
                });
        }

        DB::table('playlist_track')->delete();
        DB::table('playlists')->delete();
    }
};
