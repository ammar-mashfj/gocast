<?php

namespace App\Services;

use App\Models\Station;
use App\Models\Track;
use Illuminate\Support\Facades\DB;

/**
 * Decides which rotation track a station plays next.
 *
 * This is the half of the AutoDJ that used to live inside Liquidsoap. The
 * playlist() source held the running order in its own memory and re-read
 * playlist.m3u only when told to — and that reload, measured on 2.4.5, restarts
 * the list at index 0. So adding a track sent listeners back to song one.
 *
 * Here the running order is a query, asked one track at a time by
 * `request.dynamic` (the same design AzuraCast and LibreTime use). There is no
 * list inside Liquidsoap, therefore no cursor to reset and no reload to send:
 * a track added mid-rotation simply appears when the rotation reaches its
 * position, and nothing else is disturbed.
 *
 * It also puts the interesting questions within reach. "What plays next" is
 * where no-repeat rules, weighted playlists, dayparting and ad breaks all live,
 * and none of them can be expressed as a file.
 */
class AutoDjScheduler
{
    public function __construct(private readonly PlaylistFileWriter $writer) {}

    /**
     * The next track as a Liquidsoap `annotate:` URI, or null when the station
     * has no rotation.
     *
     * Null is a normal answer, not a failure: a station with an empty library
     * is the common case for a live-only broadcaster. The script turns it into
     * an unavailable source, and the fallback demotes to the silence bed —
     * exactly what an empty playlist.m3u used to do.
     */
    public function next(Station $station): ?string
    {
        $track = $this->advance($station);

        return $track === null ? null : $this->writer->annotateTrack($track);
    }

    /**
     * Move the cursor on and return the track it lands on.
     *
     * Ordering is by `position`, top to bottom, wrapping at the end — the
     * semantics `mode = "normal"` gave us, preserved deliberately because the
     * owner controls that order with the drag handles in the library.
     */
    private function advance(Station $station): ?Track
    {
        $cursor = $station->autodj_cursor_position;

        $next = $station->musicTracks()
            ->when($cursor !== null, fn ($query) => $query->where('position', '>', $cursor))
            ->orderBy('position')
            ->first();

        // Past the end, or the cursor points beyond a list that has since
        // shrunk: start the next round from the top.
        $next ??= $station->musicTracks()->orderBy('position')->first();

        if ($next === null) {
            return null;
        }

        // Straight to the query builder, not the model: this runs at every
        // track boundary on every station, and it must not fire StationObserver
        // (which re-renders the .liq and restarts containers), write an
        // activity-log entry, or bump `updated_at` — the station has not
        // changed, only our place in its rotation.
        DB::table('stations')
            ->where('id', $station->getKey())
            ->update(['autodj_cursor_position' => $next->position]);

        $station->autodj_cursor_position = $next->position;
        $station->syncOriginalAttribute('autodj_cursor_position');

        return $next;
    }
}
