<?php

namespace App\Services;

use App\Models\AutodjSlot;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\Track;
use Carbon\CarbonImmutable;
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
    /**
     * How far ahead to look for something that must start on time. Past this
     * a song is never long enough to collide with it.
     */
    private const PLAN_HORIZON_HOURS = 6;

    /**
     * A song ending this much past a boundary still counts as fitting: the
     * start-time estimate is no finer than this, and trimming half a second
     * is not worth a fade.
     */
    private const FIT_TOLERANCE_SECONDS = 0.5;

    /**
     * A track whose length is unknown is played as normal while the next
     * boundary is at least this far away, on the bet that it is a song and
     * not an hour-long mix. Closer than this it is treated as not fitting.
     */
    private const UNKNOWN_LENGTH_SAFE_SECONDS = 30 * 60;

    public function __construct(
        private readonly PlaylistFileWriter $writer,
        private readonly AutoDjProgramme $programme,
        private readonly JingleClock $jingles,
    ) {}

    /**
     * Under this many seconds before something that must start on time, it
     * starts now instead: a slot or jingle a few seconds early is inaudible,
     * a song cut after ten seconds is not.
     */
    public static function earlyStartSeconds(): float
    {
        return max(1.0, (float) config('liquidsoap.hard_start_early_seconds', 20.0));
    }

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
    public function next(Station $station, ?float $remaining = null): ?string
    {
        if (! ($station->user?->canUseAutoDj() ?? false)) {
            return null;
        }

        if ($remaining === null) {
            return $this->nextUnplanned($station);
        }

        $now = CarbonImmutable::now();
        $queueStart = $this->queueStart($station, $now, $remaining);
        $start = $queueStart->addMilliseconds((int) round(self::leadSeconds() * 1000));

        $answer = $this->nextPlanned($station, $start);

        if ($answer === null) {
            return null;
        }

        [$uri, $airtime] = $answer;
        $this->noteQueued($station, $now, $queueStart, $airtime);

        return $uri;
    }

    /**
     * When the answer to this ask starts, in the container's own timeline:
     * when its current track ends.
     *
     * Except when Liquidsoap asks again before the previous answer has finished
     * playing — measured on 2.4.5, request.dynamic occasionally asks
     * twice within a fraction of a second. The second answer then plays
     * after the first, which the current track's remaining time cannot say.
     */
    private function queueStart(Station $station, CarbonImmutable $now, float $remaining): CarbonImmutable
    {
        $start = $now->addMilliseconds((int) round(max(0.0, $remaining) * 1000));

        $queuedAt = $station->autodj_queued_at;
        $queuedStart = $station->autodj_queued_start;
        $queuedAirtime = $station->autodj_queued_airtime;

        if ($queuedAt === null || $queuedStart === null || $queuedAirtime === null) {
            return $start;
        }

        $queuedStart = CarbonImmutable::instance($queuedStart);

        $afterQueued = $queuedStart->addMilliseconds((int) round((float) $queuedAirtime * 1000));

        // Judged on when the previous answer ENDS, not starts: at boot, after
        // a skip or a retry it was asked with nothing playing, so it started
        // at once and has already begun by the time the double ask arrives.
        if (CarbonImmutable::instance($queuedAt) > $now->subSeconds(2) && $afterQueued > $now) {
            return $afterQueued->max($start);
        }

        return $start;
    }

    /**
     * How far behind the container's timeline listeners are. With crossfade
     * on, Liquidsoap reads the next track a crossfade window ahead of what is
     * heard — measured on 2.4.5 with a 5s window: 6.3s after a song, 1.5s
     * after a 3s jingle. Adding the window lands on-time starts within about
     * a second and a half after songs, a few seconds early after a jingle.
     */
    public static function leadSeconds(): float
    {
        $configured = config('liquidsoap.planning_lead_seconds');

        if (is_numeric($configured)) {
            return max(0.0, (float) $configured);
        }

        return config('liquidsoap.crossfade_enabled') ? max(0.0, (float) config('liquidsoap.crossfade_duration')) : 0.0;
    }

    /**
     * Remember what was just handed out, for queueStart(). Query builder,
     * not save(): a track boundary is not a station edit.
     */
    private function noteQueued(Station $station, CarbonImmutable $now, CarbonImmutable $start, ?float $airtime): void
    {
        $values = [
            'autodj_queued_at' => $now->utc()->format('Y-m-d H:i:s.v'),
            'autodj_queued_start' => $start->utc()->format('Y-m-d H:i:s.v'),
            'autodj_queued_airtime' => $airtime,
        ];

        DB::table('stations')->where('id', $station->getKey())->update($values);

        $station->forceFill($values);
        $station->syncOriginalAttributes(array_keys($values));
    }

    /**
     * For a container on a script that does not report its timing: the
     * schedule as of now, music only. See the class docblock.
     */
    private function nextUnplanned(Station $station): ?string
    {
        $programme = $this->programme->resolve($station);
        $playlist = $programme['playlist'];

        if ($playlist === null) {
            return null;
        }

        $this->noteSwitch($station, $playlist, $programme['slot']);

        [$track] = $playlist->order === Playlist::ORDER_SHUFFLE
            ? $this->advanceShuffled($playlist)
            : $this->advanceSequential($playlist);

        return $track === null ? null : $this->writer->annotateTrack($track, playlist: $playlist->name);
    }

    /**
     * What starts at `$start`.
     *
     *   1. Something that must start on time is under earlyStartSeconds()
     *      away: it starts now, a little early.
     *   2. A set-time jingle is due: the jingle.
     *   3. An every-N jingle is due and ends before the next on-time
     *      boundary: the jingle.
     *   4. Otherwise a song from the scheduled playlist, one that ends before
     *      the next boundary when there is one in reach — or, when no song
     *      fits, the next one cut to end on it with a fade.
     *
     * A station with nothing to rotate plays no jingles either: they punctuate
     * music, and a station of only IDs is the thing StationAudioPolicy powers
     * down.
     */
    /**
     * @return array{0: string, 1: ?float}|null the answer, and how long it plays
     */
    private function nextPlanned(Station $station, CarbonImmutable $start): ?array
    {
        $early = self::earlyStartSeconds();
        $jingles = $this->jingles->enabled($station);

        $boundary = $this->nextBoundary($station, $start, $jingles);
        $from = $start;

        if ($boundary !== null && $start->floatDiffInSeconds($boundary) < $early) {
            $from = $boundary;
            $boundary = $this->nextBoundary($station, $from, $jingles);
        }

        $programme = $this->programme->resolve($station, $from);
        $playlist = $programme['playlist'];

        // An empty default comes back as the playlist, not as null; without
        // music there is nothing for a jingle to punctuate either.
        if ($playlist === null || ($jingles && ! $playlist->tracks()->exists())) {
            return null;
        }

        if ($jingles && ($time = $this->jingles->setTimeDue($station, $start, $early)) !== null
            && ($jingle = $this->jingles->pick($station)) !== null) {
            $this->jingles->played($station, $jingle, $time->max($start));

            return [$this->writer->annotateTrack($jingle, isJingle: true), $jingle->airtimeSeconds()];
        }

        $budget = $boundary === null ? null : $start->floatDiffInSeconds($boundary);

        if ($jingles && $this->jingles->breakDue($station, $start)
            && ($jingle = $this->jingles->pick($station)) !== null
            && ($budget === null || $this->fits($jingle, $budget))) {
            $this->jingles->played($station, $jingle, $start);

            return [$this->writer->annotateTrack($jingle, isJingle: true), $jingle->airtimeSeconds()];
        }

        $this->noteSwitch($station, $playlist, $programme['slot']);

        [$track, $cut] = $playlist->order === Playlist::ORDER_SHUFFLE
            ? $this->advanceShuffled($playlist, $budget)
            : $this->advanceSequential($playlist, $budget);

        if ($track === null) {
            return null;
        }

        $this->jingles->songPlayed($station);

        return [
            $this->writer->annotateTrack($track, playlist: $playlist->name, playFor: $cut),
            $cut ?? $track->airtimeSeconds(),
        ];
    }

    /**
     * The next moment after `$after` that something must start on time: an
     * on-time slot, or a set-time jingle not yet played.
     */
    private function nextBoundary(Station $station, CarbonImmutable $after, bool $jingles): ?CarbonImmutable
    {
        $horizon = $after->addHours(self::PLAN_HORIZON_HOURS);

        $candidates = [$this->programme->nextHardStart($station, $after, $horizon)];

        if ($jingles) {
            $spent = $station->autodj_last_jingle_at === null ? null : CarbonImmutable::instance($station->autodj_last_jingle_at);
            $candidates[] = $this->jingles->nextSetTime($station, $spent !== null && $spent > $after ? $spent : $after);
        }

        $candidates = array_filter($candidates);

        return $candidates === [] ? null : min($candidates);
    }

    /** Whether `$track` is known to end within `$budget` seconds. */
    private function fits(Track $track, float $budget): bool
    {
        $airtime = $track->airtimeSeconds();

        return $airtime !== null && $airtime <= $budget + self::FIT_TOLERANCE_SECONDS;
    }

    /**
     * Whether the next track in line would run into a boundary `$budget`
     * seconds away (null: none in reach), so something else has to give.
     */
    private function overruns(Track $track, ?float $budget): bool
    {
        if ($budget === null) {
            return false;
        }

        if ($track->airtimeSeconds() === null) {
            return $budget < self::UNKNOWN_LENGTH_SAFE_SECONDS;
        }

        return ! $this->fits($track, $budget);
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
     *
     * With a `$budget` (seconds to something that must start on time) the
     * next track is still the next track — an in-order playlist is an order
     * the owner chose, so nothing is skipped past. When it does not fit it is
     * returned with that budget as its cut, and plays faded to end on time.
     *
     * @return array{0: ?Track, 1: ?float} the track, and where to cut it
     */
    private function advanceSequential(Playlist $playlist, ?float $budget = null): array
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
            return [null, null];
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

        return [$next, $this->overruns($next, $budget) ? $budget : null];
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
     *
     * With a `$budget`, see popShuffled().
     *
     * @return array{0: ?Track, 1: ?float} the track, and where to cut it
     */
    private function advanceShuffled(Playlist $playlist, ?float $budget = null): array
    {
        // One short transaction with the playlist row locked, so the pop
        // here and dealIn()'s splice (which runs under PlaylistTracks::lock)
        // serialise instead of racing: without it a track added while this
        // boundary was in flight could be written into the deck and then
        // overwritten by the popped copy read a moment earlier, and would
        // wait for the next deal. Same lock order as PlaylistTracks —
        // playlist row first — so the two cannot deadlock.
        return DB::transaction(function () use ($playlist, $budget) {
            $raw = DB::table('playlists')
                ->where('id', $playlist->getKey())
                ->lockForUpdate()
                ->value('deck');
            $deck = is_string($raw) ? (json_decode($raw, true) ?: []) : [];

            return $this->popShuffled($playlist, $deck, $budget);
        });
    }

    /**
     * The body of advanceShuffled(), given the deck as read under the lock.
     *
     * With a `$budget` (seconds to something that must start on time) the top
     * card is played only if it ends in time. Otherwise the first card further
     * down that does is taken out of the deck instead, and the ones it was
     * taken past stay where they are — they still play this cycle, just
     * after the boundary, so the shuffle stays fair. A card of unknown length
     * is never taken that way. When no card fits, the top card plays, cut to
     * end on time.
     *
     * @param  list<string>  $deck
     * @return array{0: ?Track, 1: ?float} the track, and where to cut it
     */
    private function popShuffled(Playlist $playlist, array $deck, ?float $budget = null): array
    {
        $track = null;

        // Drop dead IDs off the top until one still exists. A track deleted or
        // removed since the deal leaves its ID behind, and skipping it lazily
        // here is cheaper and less fragile than rewriting every deck from the
        // delete path. Normally this loop runs exactly once.
        while ($deck !== [] && $track === null) {
            $track = $this->find($playlist, $deck[0]);

            if ($track === null) {
                array_shift($deck);
            }
        }

        // Cold start (no deck yet, or the owner just switched to shuffle), or
        // a deck emptied entirely by deletions.
        if ($track === null) {
            $deck = $this->deal($playlist);

            if ($deck === []) {
                return [null, null];
            }

            $track = $this->find($playlist, $deck[0]);

            // Every ID came from the playlist a statement ago, so only a
            // delete landing in between can get us here. Bail rather than
            // loop: the next request deals again, and one silent retry_delay
            // is a better failure than a query storm on the audio path.
            if ($track === null) {
                return [null, null];
            }
        }

        $index = 0;
        $cut = null;

        if ($this->overruns($track, $budget)) {
            $fitting = $this->firstFitting($playlist, $deck, $budget);

            if ($fitting === null) {
                $cut = $budget;
            } else {
                [$index, $track] = $fitting;
            }
        }

        array_splice($deck, $index, 1);

        // Refill EAGERLY, the moment the deck runs dry, rather than lazily on
        // the next request. This is the only place the seam is cheap to fix:
        // the track that ends this deck is right here in hand, so the new deck
        // can be dealt away from it without persisting "last played" anywhere.
        if ($deck === []) {
            $deck = $this->deal($playlist, avoidHead: $track->getKey());
        }

        $this->persistDeck($playlist, $deck);

        return [$track, $cut];
    }

    /**
     * The first card below the top of `$deck` that ends within `$budget`, as
     * [its index, the track]. One query for the whole deck — this runs only
     * in the last few minutes before an on-time boundary.
     *
     * @param  list<string>  $deck
     * @return array{0: int, 1: Track}|null
     */
    private function firstFitting(Playlist $playlist, array $deck, float $budget): ?array
    {
        $rest = array_slice($deck, 1);

        if ($rest === []) {
            return null;
        }

        $members = $playlist->tracks()->whereIn('tracks.id', $rest)->get()
            ->keyBy(fn (Track $track) => (string) $track->getKey());

        foreach ($rest as $offset => $id) {
            $candidate = $members->get($id);

            if ($candidate !== null && $this->fits($candidate, $budget)) {
                return [$offset + 1, $candidate];
            }
        }

        return null;
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
