<?php

namespace App\Services;

use App\Models\Station;
use App\Models\Track;
use Illuminate\Support\Facades\DB;

/**
 * Decides which rotation track a station plays next.
 *
 * This is the half of the AutoDJ that used to live inside Liquidsoap. The
 * playlist() source held the running order in its own memory and re-read its
 * m3u only when told to — and that reload, measured on 2.4.5, restarts the
 * list at index 0. So adding a track sent listeners back to song one.
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
     * has no rotation, or none it is entitled to play.
     *
     * Null is a normal answer, not a failure: a station with an empty library
     * is the common case for a live-only broadcaster. The script turns it into
     * an unavailable source, and the fallback demotes to the silence bed —
     * exactly what an empty rotation file used to do.
     *
     * THE PLAN IS PART OF THE QUESTION, and this is the only place the answer
     * can be enforced. Nothing in the rendered .liq knows about plans: the
     * AutoDJ arm is written into every station's script whatever they pay, and
     * a plan change never restarts a container (UserObserver pushes the
     * watermark over telnet precisely to avoid dropping listeners mid-show).
     * So a station downgraded off a paid plan kept asking for tracks here and
     * kept being given them — it lost only the ability to upload new ones. The
     * guard below is what actually takes the music off air, and because the
     * script already treats null as "nothing to play", it does so at the next
     * track boundary rather than by cutting the current one.
     *
     * It returns BEFORE the cursor moves, deliberately. The container keeps
     * polling every `autodj_retry_delay` seconds for as long as it runs, and
     * advancing the cursor — or dealing a new shuffle deck — on each of those
     * would shred the running order the owner gets back if they re-subscribe.
     */
    public function next(Station $station): ?string
    {
        if (! ($station->user?->canUseAutoDj() ?? false)) {
            return null;
        }

        $track = $station->autodj_order === Station::AUTODJ_ORDER_SHUFFLE
            ? $this->advanceShuffled($station)
            : $this->advanceSequential($station);

        return $track === null ? null : $this->writer->annotateTrack($track);
    }

    /**
     * Move the cursor on and return the track it lands on.
     *
     * Ordering is by `position`, top to bottom, wrapping at the end — the
     * semantics `mode = "normal"` gave us, preserved deliberately because the
     * owner controls that order with the drag handles in the library.
     */
    private function advanceSequential(Station $station): ?Track
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

    /**
     * Take the next card off the station's deck, dealing a new one when the
     * current deck runs out.
     *
     * The deck is a stored random permutation of the whole rotation — see the
     * migration for why it holds IDs. Popping from it is what makes "no
     * repeats" a structural property rather than a rule: a track cannot play
     * twice in a cycle because it is no longer in the list. The alternative
     * (pick at random each time, reject anything played in the last N) needs
     * an N, needs a history to check it against, and still has to decide what
     * to do when the library is smaller than N.
     */
    private function advanceShuffled(Station $station): ?Track
    {
        $deck = $station->autodj_deck ?? [];
        $track = null;

        // Pop until we land on a track that still exists. A track deleted
        // since the deal leaves a dead ID behind, and skipping it lazily here
        // is cheaper and less fragile than rewriting every station's deck from
        // the delete path. Normally this loop runs exactly once.
        while ($deck !== [] && $track === null) {
            $track = $this->find($station, array_shift($deck));
        }

        // Cold start (no deck yet, or the owner just switched to shuffle), or
        // a deck emptied entirely by deletions.
        if ($track === null) {
            $deck = $this->deal($station);

            if ($deck === []) {
                return null;
            }

            $track = $this->find($station, array_shift($deck));

            // Every ID came from the rotation a statement ago, so only a
            // delete landing in between can get us here. Bail rather than
            // loop: the next request deals again, and one silent retry_delay
            // is a better failure than a query storm on the audio path.
            if ($track === null) {
                return null;
            }
        }

        // Refill EAGERLY, the moment the deck runs dry, rather than lazily on
        // the next request. This is the only place the seam is cheap to fix:
        // the track that ends this deck is right here in hand, so the new deck
        // can be dealt away from it without persisting "last played" anywhere.
        if ($deck === []) {
            $deck = $this->deal($station, avoidHead: $track->getKey());
        }

        $this->persistDeck($station, $deck);

        return $track;
    }

    /**
     * A fresh shuffle of the station's whole rotation.
     *
     * `$avoidHead` is the track that just played. Without it the one repeat a
     * deck cannot prevent on its own is the seam between two decks: the last
     * card of the old one coming up first in the new one, which is a 1-in-N
     * chance every cycle and the only back-to-back repeat a listener can ever
     * hear in this mode.
     *
     * @return list<string>
     */
    private function deal(Station $station, ?string $avoidHead = null): array
    {
        $deck = $station->musicTracks()->pluck('id')->all();

        shuffle($deck);

        // Swapping the head with any later slot keeps the result a
        // permutation, so the once-per-cycle guarantee survives the fix. A
        // one-track rotation cannot be fixed and must not be broken trying —
        // it repeats, unavoidably, and the count guard is what lets it.
        if ($avoidHead !== null && count($deck) > 1 && $deck[0] === $avoidHead) {
            $swap = random_int(1, count($deck) - 1);
            [$deck[0], $deck[$swap]] = [$deck[$swap], $deck[0]];
        }

        return $deck;
    }

    /**
     * One rotation track by ID, or null if it is no longer in the rotation.
     *
     * Scoped through musicTracks() rather than Track::find() so a deck can
     * never hand back another station's track, or a jingle that was recategorised
     * out of the rotation after the deal.
     */
    private function find(Station $station, string $id): ?Track
    {
        return $station->musicTracks()->whereKey($id)->first();
    }

    /**
     * Write the remaining deck back.
     *
     * Straight to the query builder for exactly the reason advanceSequential()
     * does it — see the comment there. StationObserver must not fire at a track
     * boundary, or every listener is dropped mid-song.
     *
     * The encode is ours to do: DB::table bypasses the model's casts, so
     * handing it the array would stringify to "Array" and quietly corrupt the
     * column.
     *
     * @param  list<string>  $deck
     */
    private function persistDeck(Station $station, array $deck): void
    {
        DB::table('stations')
            ->where('id', $station->getKey())
            ->update(['autodj_deck' => json_encode($deck)]);

        $station->autodj_deck = $deck;
        $station->syncOriginalAttribute('autodj_deck');
    }
}
