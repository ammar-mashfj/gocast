<?php

use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The backfill migration — every station that predates playlists gets its
 * old rotation back as the default playlist, cursor and deck included, so
 * the next track after the deploy is the one it would have been before.
 *
 * The test database has already run the whole chain, including the column
 * drop, so this puts the three old columns back for the duration of one
 * test, seeds them, runs the backfill's up() by hand, and drops them again.
 *
 * DDL commits implicitly on MySQL, which breaks the transaction
 * RefreshDatabase wraps each test in — so this file cleans up its own rows
 * explicitly rather than trusting the rollback.
 */
function backfillMigration(): object
{
    return require database_path('migrations/2026_09_20_134242_backfill_default_playlists.php');
}

function withLegacyColumns(Closure $body): void
{
    Schema::table('stations', function (Blueprint $table) {
        $table->unsignedInteger('autodj_cursor_position')->nullable();
        $table->string('autodj_order', 16)->default('sequential');
        $table->json('autodj_deck')->nullable();
    });

    try {
        $body();
    } finally {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['autodj_cursor_position', 'autodj_order', 'autodj_deck']);
        });
    }
}

it('turns each station\'s rotation into its default playlist, state included', function () {
    withLegacyColumns(function () {
        $station = Station::factory()->create();
        $tracks = collect(range(1, 3))->map(fn (int $n) => Track::factory()->for($station)->create(['position' => $n]));
        $jingle = Track::factory()->jingle()->for($station)->create(['position' => 1]);

        // Simulate the pre-playlist world: no default playlist yet, and the
        // rotation state on the station row.
        DB::table('playlist_track')->whereIn('track_id', $tracks->pluck('id'))->delete();
        DB::table('playlists')->where('station_id', $station->id)->delete();
        DB::table('stations')->where('id', $station->id)->update([
            'autodj_order' => 'shuffle',
            'autodj_cursor_position' => 2,
            'autodj_deck' => json_encode([$tracks[2]->id, $tracks[0]->id]),
        ]);

        try {
            backfillMigration()->up();

            $playlist = Playlist::query()->where('station_id', $station->id)->sole();

            expect($playlist->is_default)->toBeTrue()
                ->and($playlist->name)->toBe(Playlist::DEFAULT_NAME)
                ->and($playlist->order)->toBe('shuffle')
                ->and($playlist->cursor_position)->toBe(2)
                ->and($playlist->deck)->toBe([$tracks[2]->id, $tracks[0]->id]);

            $members = DB::table('playlist_track')
                ->where('playlist_id', $playlist->id)
                ->orderBy('position')
                ->pluck('position', 'track_id')
                ->all();

            expect($members)->toBe([$tracks[0]->id => 1, $tracks[1]->id => 2, $tracks[2]->id => 3])
                ->and(array_key_exists($jingle->id, $members))->toBeFalse();

            // Idempotent: a second run changes nothing.
            backfillMigration()->up();
            expect(Playlist::query()->where('station_id', $station->id)->count())->toBe(1);

            // And down() puts the state back on the station row.
            backfillMigration()->down();
            $row = DB::table('stations')->where('id', $station->id)->first();
            expect($row->autodj_order)->toBe('shuffle')
                ->and((int) $row->autodj_cursor_position)->toBe(2)
                ->and(json_decode($row->autodj_deck, true))->toBe([$tracks[2]->id, $tracks[0]->id])
                ->and(DB::table('playlists')->count())->toBe(0);
        } finally {
            $station->forceDelete();
            $station->user?->forceDelete();
        }
    });
});
