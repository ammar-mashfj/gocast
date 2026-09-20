<?php

namespace App\Services;

use App\Models\AutodjSlot;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\StationEvent;
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
 * The rotation being walked is a Playlist: whichever one AutoDjProgramme says
 * is on now — a scheduled slot's, or the station's default. Because each
 * playlist carries its own cursor and deck, leaving one for another and
 * coming back resumes where it left off.
 */
class AutoDjScheduler
{
    public function __construct(
        private readonly PlaylistFileWriter $writer,
        private readonly AutoDjProgramme $programme,
    ) {}

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

        $programme = $this->programme->resolve($station);
        $playlist = $programme['playlist'];

        if ($playlist === null) {
            return null;
        }

        $this->noteSwitch($station, $playlist, $programme['slot']);

        $track = $playlist->order === Playlist::ORDER_SHUFFLE
            ? $this->advanceShuffled($playlist)
            : $this->advanceSequential($playlist);

        return $track === null ? null : $this->writer->annotateTrack($track, playlist: $playlist->name);
    }

    /**
     * Put a `playlist_changed` event on the timeline the first time a boundary
     * lands in a different playlist than the last one.
     *
     * The comparison is against a column written here with the query builder
     * — the same discipline as the cursor: a track boundary must never look
     * like a station edit. Monitoring only; nothing reads the column back
     * except this method, and record() swallows its own failures.
     */
    private function noteSwitch(Station $station, Playlist $playlist, ?AutodjSlot $slot): void
    {
        $previous = $station->autodj_last_playlist_id;

        if ($previous === $playlist->getKey()) {
            return;
        }

        DB::table('stations')
            ->where('id', $station->getKey())
            ->update(['autodj_last_playlist_id' => $playlist->getKey()]);

        $station->autodj_last_playlist_id = $playlist->getKey();
        $station->syncOriginalAttribute('autodj_last_playlist_id');

        StationEvent::record($station, StationEvent::TYPE_PLAYLIST_CHANGED, StationEvent::SOURCE_SYSTEM, [
            'from_playlist_id' => $previous,
            'to_playlist_id' => $playlist->getKey(),
            'playlist' => $playlist->name,
            'slot_id' => $slot?->getKey(),
            'slot' => $slot?->label,
        ]);
    }

    /**
     * Deal newly added tracks into the remaining shuffle deck.
     *
     * Without this a track added to a shuffled playlist waits for the next
     * deal — the rest of the current cycle, half a day on a 200-track
     * library. Each new ID goes in at a random offset, so the cycle stays a
     * uniform permutation of what the playlist now holds.
     *
     * A null or empty deck means no cycle is in progress (nothing has played
     * yet, or the mode was just switched); the next deal includes the new
     * tracks on its own, so there is nothing to splice into.
     *
     * @param  list<string>  $trackIds
     */
    public function dealIn(Playlist $playlist, array $trackIds): void
    {
        if ($trackIds === [] || $playlist->order !== Playlist::ORDER_SHUFFLE) {
            return;
        }

        // Fresh from the row rather than the model: the caller may hold an
        // instance loaded before the scheduler last moved the deck on.
        $raw = DB::table('playlists')->where('id', $playlist->getKey())->value('deck');
        $deck = is_string($raw) ? (json_decode($raw, true) ?: []) : [];

        if ($deck === []) {
            return;
        }

        foreach ($trackIds as $id) {
            if (in_array($id, $deck, true)) {
                continue;
            }
            array_splice($deck, random_int(0, count($deck)), 0, [$id]);
        }

        $this->persistDeck($playlist, array_values($deck));
    }

    /**
     * Move the cursor on and return the track it lands on.
     *
     * Ordering is by pivot `position`, top to bottom, wrapping at the end —
     * the semantics `mode = "normal"` gave us, preserved deliberately because
     * the owner controls that order with the drag handles in the library.
     */
    private function advanceSequential(Playlist $playlist): ?Track
    {
        $cursor = $playlist->cursor_position;

        // On the relation itself, not inside when(): the closure there gets
        // the Eloquent builder, which turns wherePivot() into a dynamic
        // `where pivot = ...` and silently matches nothing.
        $after = $playlist->tracks();
        if ($cursor !== null) {
            $after->wherePivot('position', '>', $cursor);
        }
        $next = $after->first();

        // Past the end, or the cursor points beyond a list that has since
        // shrunk: start the next round from the top.
        $next ??= $playlist->tracks()->first();

        if ($next === null) {
            return null;
        }

        // Straight to the query builder, not the model: this runs at every
        // track boundary on every station. Nothing observes Playlist today,
        // but the discipline is the same one that keeps StationObserver (which
        // re-renders the .liq and restarts containers) off this path — a
        // track boundary is not an edit, and must not bump `updated_at` or
        // write an activity-log entry.
        DB::table('playlists')
            ->where('id', $playlist->getKey())
            ->update(['cursor_position' => $next->pivot->position]);

        $playlist->cursor_position = $next->pivot->position;
        $playlist->syncOriginalAttribute('cursor_position');

        return $next;
    }

    /**
     * Take the next card off the playlist's deck, dealing a new one when the
     * current deck runs out.
     *
     * The deck is a stored random permutation of the whole playlist — see the
     * migration for why it holds IDs. Popping from it is what makes "no
     * repeats" a structural property rather than a rule: a track cannot play
     * twice in a cycle because it is no longer in the list. The alternative
     * (pick at random each time, reject anything played in the last N) needs
     * an N, needs a history to check it against, and still has to decide what
     * to do when the library is smaller than N.
     */
    private function advanceShuffled(Playlist $playlist): ?Track
    {
        // One short transaction with the playlist row locked, so the pop
        // here and dealIn()'s splice (which runs under PlaylistTracks::lock)
        // serialise instead of racing: without it a track added while this
        // boundary was in flight could be written into the deck and then
        // overwritten by the popped copy read a moment earlier, and would
        // wait for the next deal. Same lock order as PlaylistTracks —
        // playlist row first — so the two cannot deadlock.
        return DB::transaction(function () use ($playlist) {
            $raw = DB::table('playlists')
                ->where('id', $playlist->getKey())
                ->lockForUpdate()
                ->value('deck');
            $deck = is_string($raw) ? (json_decode($raw, true) ?: []) : [];

            return $this->popShuffled($playlist, $deck);
        });
    }

    /**
     * The body of advanceShuffled(), given the deck as read under the lock.
     *
     * @param  list<string>  $deck
     */
    private function popShuffled(Playlist $playlist, array $deck): ?Track
    {
        $track = null;

        // Pop until we land on a track that still exists. A track deleted or
        // removed since the deal leaves a dead ID behind, and skipping it
        // lazily here is cheaper and less fragile than rewriting every deck
        // from the delete path. Normally this loop runs exactly once.
        while ($deck !== [] && $track === null) {
            $track = $this->find($playlist, array_shift($deck));
        }

        // Cold start (no deck yet, or the owner just switched to shuffle), or
        // a deck emptied entirely by deletions.
        if ($track === null) {
            $deck = $this->deal($playlist);

            if ($deck === []) {
                return null;
            }

            $track = $this->find($playlist, array_shift($deck));

            // Every ID came from the playlist a statement ago, so only a
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
            $deck = $this->deal($playlist, avoidHead: $track->getKey());
        }

        $this->persistDeck($playlist, $deck);

        return $track;
    }

    /**
     * A fresh shuffle of the whole playlist.
     *
     * `$avoidHead` is the track that just played. Without it the one repeat a
     * deck cannot prevent on its own is the seam between two decks: the last
     * card of the old one coming up first in the new one, which is a 1-in-N
     * chance every cycle and the only back-to-back repeat a listener can ever
     * hear in this mode.
     *
     * @return list<string>
     */
    private function deal(Playlist $playlist, ?string $avoidHead = null): array
    {
        $deck = $playlist->tracks()->pluck('tracks.id')->map(fn ($id) => (string) $id)->all();

        shuffle($deck);

        // Swapping the head with any later slot keeps the result a
        // permutation, so the once-per-cycle guarantee survives the fix. A
        // one-track playlist cannot be fixed and must not be broken trying —
        // it repeats, unavoidably, and the count guard is what lets it.
        if ($avoidHead !== null && count($deck) > 1 && $deck[0] === $avoidHead) {
            $swap = random_int(1, count($deck) - 1);
            [$deck[0], $deck[$swap]] = [$deck[$swap], $deck[0]];
        }

        return $deck;
    }

    /**
     * One member track by ID, or null if it is no longer in the playlist.
     *
     * Scoped through tracks() rather than Track::find() so a deck can never
     * hand back a track that was removed from the playlist, deleted, or
     * recategorised as a jingle after the deal.
     */
    private function find(Playlist $playlist, string $id): ?Track
    {
        return $playlist->tracks()->whereKey($id)->first();
    }

    /**
     * Write the remaining deck back.
     *
     * Straight to the query builder for exactly the reason advanceSequential()
     * does it — see the comment there.
     *
     * The encode is ours to do: DB::table bypasses the model's casts, so
     * handing it the array would stringify to "Array" and quietly corrupt the
     * column.
     *
     * @param  list<string>  $deck
     */
    private function persistDeck(Playlist $playlist, array $deck): void
    {
        DB::table('playlists')
            ->where('id', $playlist->getKey())
            ->update(['deck' => json_encode($deck)]);

        $playlist->deck = $deck;
        $playlist->syncOriginalAttribute('deck');
    }
}
