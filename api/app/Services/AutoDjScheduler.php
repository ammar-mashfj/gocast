<?php

namespace App\Services;

use App\Models\AutodjSlot;
use App\Models\JingleList;
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
     * The first station script that lets Laravel plan: it sends
     * `X-Gocast-Script`, has no jingle logic of its own, and applies
     * `liq_fade_out`. A container still running an older script gets music
     * only, never trimmed: it plays its own jingles, and a trim without the
     * fade would be an abrupt cut.
     */
    public const PLANNING_SCRIPT = 2;

    public function __construct(
        private readonly PlaylistFileWriter $writer,
        private readonly AutoDjProgramme $programme,
        private readonly JingleRotation $jingles,
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
     *
     * THE CLOCK. Liquidsoap asks for the next track the moment the previous
     * one starts, so the answer starts at now + the airtime of the track
     * last handed out (`$fresh` — the container's first ask since it booted —
     * and a previous null both mean nothing is queued: it starts now). Every
     * rule below is judged at that start time, which is also what makes a
     * slot begin with the first track that starts inside it rather than one
     * song late.
     *
     * HARD STARTS (planning scripts only). An "exactly on time" slot start
     * or an exact-time jingle is a boundary no track may run past:
     *
     *   1. under EARLY_START seconds to go — start it now, a little early;
     *   2. the next song would run past it — on a shuffled playlist, take
     *      the next song on the deck that ends in time instead (skipped
     *      songs stay on the deck);
     *   3. before a slot, a jingle that fills the gap to under EARLY_START;
     *   4. otherwise play the song and fade it out on the boundary.
     *
     * See docs/JINGLES-AND-HARD-SLOTS-PLAN.md.
     */
    public function next(Station $station, bool $fresh = false, int $script = 1): ?string
    {
        if (! ($station->user?->canUseAutoDj() ?? false)) {
            $this->clearClock($station);

            return null;
        }

        $planning = $script >= self::PLANNING_SCRIPT;
        $now = CarbonImmutable::now();
        $queued = $fresh ? null : $station->autodj_queued_seconds;
        $start = $queued === null ? $now : $now->addMilliseconds((int) round($queued * 1000));
        $afterJingle = ! $fresh && $queued !== null && $station->autodj_queued_is_jingle;

        // 1. A boundary within the early-start window is treated as reached.
        $planAt = $start;
        $early = $planning ? $this->boundaryBetween($station, $start, $start->addMilliseconds((int) (self::earlyStart() * 1000))) : null;
        if ($early !== null) {
            $planAt = $early['at'];
        }

        $programme = $this->programme->resolve($station, $planAt);
        $playlist = $programme['playlist'];

        if ($playlist === null) {
            $this->clearClock($station);

            return null;
        }

        $this->noteSwitch($station, $playlist, $programme['slot']);

        $peek = $playlist->order === Playlist::ORDER_SHUFFLE
            ? $this->peekShuffled($playlist)
            : ['track' => $this->peekSequential($playlist), 'dead' => []];
        $track = $peek['track'];

        if ($track === null) {
            $this->clearClock($station);

            return null;
        }

        // Jingles only punctuate music. Asked after the music is known to
        // exist, so a library of nothing but jingles stays silent rather than
        // putting a clip on the meter every few minutes — which would also
        // keep the station scored as in use and never powered down.
        // A due jingle is held over, not played, when it would run past a
        // hard start: lists hold promos too, longer than the early window,
        // and nothing fades a jingle. The song below handles the boundary.
        if ($planning && ! $afterJingle && ($due = $this->jingles->due($station, $planAt)) !== null
            && ! $this->runsPast($station, $planAt, $start, self::airtime($due[1]))
            && ! $this->strandsExactJingle($station, $planAt, $start, self::airtime($due[1]))) {
            return $this->serveJingle($station, $due[0], $due[1], $start, $planAt);
        }

        $airtime = self::airtime($track);
        $playFor = null;

        $boundary = $planning && $airtime !== null
            ? $this->boundaryBetween($station, $planAt, $start->addMilliseconds((int) (($airtime - self::FIT_TOLERANCE) * 1000)))
            : null;

        if ($boundary !== null) {
            $gap = $start->diffInMilliseconds($boundary['at']) / 1000;

            // 2. A song that ends in time.
            $fit = $playlist->order === Playlist::ORDER_SHUFFLE ? $this->fitFromDeck($playlist, $gap) : null;

            if ($fit !== null) {
                $track = $fit;
                $airtime = self::airtime($fit);
                $peek['dead'] = [];
            } elseif ($boundary['kind'] === 'slot' && ! $afterJingle
                && ($filler = $this->jingles->filler($station, $start, $gap, self::earlyStart())) !== null) {
                // 3. A jingle that brings the slot to within the early window.
                return $this->serveJingle($station, $filler[0], $filler[1], $start, $start);
            } else {
                // 4. Fade it out on the boundary.
                $playFor = $gap;
                $airtime = $gap;
            }
        }

        $playlist->order === Playlist::ORDER_SHUFFLE
            ? $this->consumeShuffled($playlist, $track, $peek['dead'])
            : $this->consumeSequential($playlist, $track);

        if ($planning) {
            $this->jingles->songPlayed($station);
        }

        $this->setClock($station, $start, $airtime, false);

        return $this->writer->annotateTrack(
            $track,
            playlist: $playlist->name,
            playFor: $playFor,
            fadeOut: $playFor === null ? null : self::fadeOut(),
        );
    }

    /**
     * Seconds a song may overrun a boundary before it counts as running
     * past it: predictions land within half a second (measured on 2.4.5),
     * and a song ending a fraction late is not worth trimming.
     */
    private const FIT_TOLERANCE = 0.5;

    /** Under this many seconds to a hard start, start it early instead. */
    public static function earlyStart(): float
    {
        return max(0.0, (float) config('liquidsoap.hard_start_early_seconds', 20.0));
    }

    /** Length of the fade on a song cut short by a hard start. */
    public static function fadeOut(): float
    {
        return max(0.1, (float) config('liquidsoap.hard_start_fade_seconds', 2.0));
    }

    /**
     * How long a track is on air, measured or (failing that) the header's
     * figure; null when there is no figure at all.
     */
    private static function airtime(Track $track): ?float
    {
        $airtime = $track->airtimeSeconds();

        if ($airtime === null && $track->duration_seconds > 0) {
            $airtime = (float) $track->duration_seconds;
        }

        return $airtime;
    }

    private function serveJingle(Station $station, JingleList $list, Track $track, CarbonImmutable $start, CarbonImmutable $planAt): string
    {
        $this->jingles->played($list, $track, $planAt);
        $this->setClock($station, $start, self::airtime($track), true);

        return $this->writer->annotateTrack($track, isJingle: true, playlist: $list->name);
    }

    /**
     * Whether something of `$airtime` seconds starting at `$start` would run
     * past a hard boundary after `$planAt`. Unknown length: assume not, as
     * for songs.
     */
    private function runsPast(Station $station, CarbonImmutable $planAt, CarbonImmutable $start, ?float $airtime): bool
    {
        return $airtime !== null
            && $this->boundaryBetween($station, $planAt, $start->addMilliseconds((int) (($airtime - self::FIT_TOLERANCE) * 1000))) !== null;
    }

    /**
     * Whether a jingle of `$airtime` seconds starting at `$start` would end
     * inside the early window of an exact-time jingle. The next ask would
     * then start that jingle early, but it cannot — no two jingles back to
     * back — and the song served instead starts on the boundary, so nothing
     * fades for it and the exact one plays a whole song late. Held over,
     * the song after fades on the boundary as if nothing had been due.
     * A slot start in the same spot is fine: after a jingle the slot's
     * first song simply starts early.
     */
    private function strandsExactJingle(Station $station, CarbonImmutable $planAt, CarbonImmutable $start, ?float $airtime): bool
    {
        if ($airtime === null) {
            return false;
        }

        $ends = $start->addMilliseconds((int) round($airtime * 1000));
        $boundary = $this->boundaryBetween($station, $planAt, $ends->addMilliseconds((int) (self::earlyStart() * 1000)));

        return $boundary !== null && $boundary['kind'] === 'jingle';
    }

    /**
     * The first hard boundary strictly after `$after` and at or before
     * `$until`: an "exactly on time" slot start, or an exact-time jingle.
     *
     * @return array{at: CarbonImmutable, kind: 'slot'|'jingle'}|null
     */
    private function boundaryBetween(Station $station, CarbonImmutable $after, CarbonImmutable $until): ?array
    {
        if ($until <= $after) {
            return null;
        }

        $found = null;

        foreach ($this->programme->hardStartsBetween($station, $after, $until) as $at) {
            $found = ['at' => $at, 'kind' => 'slot'];
            break;
        }

        $timezone = $station->timezone ?? 'UTC';

        foreach ($station->jingleLists as $list) {
            if (! $list->enabled || ! $list->isExact()) {
                continue;
            }

            foreach ($list->setTimesBetween($after, $until, $timezone) as $at) {
                if ($at <= $after) {
                    continue;
                }

                // Jingle before slot when both land on the same time.
                if (($found === null || $at <= $found['at']) && $list->tracks()->exists()) {
                    $found = ['at' => $at, 'kind' => 'jingle'];
                }
                break;
            }
        }

        return $found;
    }

    /**
     * Write the clock: what was just handed out, when it starts, how long
     * it plays. Query builder, as for the cursor — see consumeSequential().
     */
    private function setClock(Station $station, CarbonImmutable $start, ?float $airtime, bool $isJingle): void
    {
        $values = [
            'autodj_queued_starts_at' => $start->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s.v'),
            'autodj_queued_seconds' => $airtime,
            'autodj_queued_is_jingle' => $isJingle,
        ];

        DB::table('stations')->where('id', $station->getKey())->update($values);

        $station->autodj_queued_starts_at = $start;
        $station->autodj_queued_seconds = $airtime;
        $station->autodj_queued_is_jingle = $isJingle;
        $station->syncOriginalAttributes(array_keys($values));
    }

    /**
     * Nothing is queued: the next track handed out starts as soon as it is.
     * Skipped when already clear, because an empty station polls here every
     * few seconds for as long as it runs.
     */
    private function clearClock(Station $station): void
    {
        if ($station->autodj_queued_seconds === null && ! $station->autodj_queued_is_jingle) {
            return;
        }

        DB::table('stations')->where('id', $station->getKey())->update([
            'autodj_queued_seconds' => null,
            'autodj_queued_is_jingle' => false,
        ]);

        $station->autodj_queued_seconds = null;
        $station->autodj_queued_is_jingle = false;
        $station->syncOriginalAttributes(['autodj_queued_seconds', 'autodj_queued_is_jingle']);
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
     * The track after the cursor, without moving it.
     *
     * Ordering is by pivot `position`, top to bottom, wrapping at the end —
     * the semantics `mode = "normal"` gave us, preserved deliberately because
     * the owner controls that order with the drag handles in the library.
     * Never fit-picked: an owner who set an order (chapters, a running show)
     * gets that order, and a hard start fades the song instead.
     */
    private function peekSequential(Playlist $playlist): ?Track
    {
        $cursor = $playlist->cursor_position;

        // On the relation itself, not inside when(): the closure there gets
        // the Eloquent builder, which turns wherePivot() into a dynamic
        // `where pivot = ...` and silently matches nothing.
        $after = $playlist->tracks();
        if ($cursor !== null) {
            $after->wherePivot('position', '>', $cursor);
        }

        // Past the end, or the cursor points beyond a list that has since
        // shrunk: start the next round from the top.
        return $after->first() ?? $playlist->tracks()->first();
    }

    /**
     * Move the cursor onto the track being handed out.
     *
     * Straight to the query builder, not the model: this runs at every
     * track boundary on every station. Nothing observes Playlist today,
     * but the discipline is the same one that keeps StationObserver (which
     * re-renders the .liq and restarts containers) off this path — a
     * track boundary is not an edit, and must not bump `updated_at` or
     * write an activity-log entry.
     */
    private function consumeSequential(Playlist $playlist, Track $track): void
    {
        DB::table('playlists')
            ->where('id', $playlist->getKey())
            ->update(['cursor_position' => $track->pivot->position]);

        $playlist->cursor_position = $track->pivot->position;
        $playlist->syncOriginalAttribute('cursor_position');
    }

    /**
     * The card on top of the playlist's deck, without taking it, plus the
     * dead IDs above it (tracks deleted or removed since the deal) for
     * consumeShuffled() to sweep off.
     *
     * The deck is a stored random permutation of the whole playlist — see the
     * migration for why it holds IDs. Taking from it is what makes "no
     * repeats" a structural property rather than a rule: a track cannot play
     * twice in a cycle because it is no longer in the list. The alternative
     * (pick at random each time, reject anything played in the last N) needs
     * an N, needs a history to check it against, and still has to decide what
     * to do when the library is smaller than N.
     *
     * Cold start (no deck yet, or the owner just switched to shuffle), or a
     * deck emptied entirely by deletions: deal one and store it.
     *
     * @return array{track: ?Track, dead: list<string>}
     */
    private function peekShuffled(Playlist $playlist): array
    {
        $raw = DB::table('playlists')->where('id', $playlist->getKey())->value('deck');
        $deck = is_string($raw) ? (json_decode($raw, true) ?: []) : [];
        $dead = [];

        foreach ($deck as $id) {
            $track = $this->find($playlist, $id);

            if ($track !== null) {
                return ['track' => $track, 'dead' => $dead];
            }

            $dead[] = $id;
        }

        $deck = $this->deal($playlist);

        if ($deck === []) {
            return ['track' => null, 'dead' => []];
        }

        $this->persistDeck($playlist, $deck);

        // Every ID came from the playlist a statement ago, so only a delete
        // landing in between can make this null. The next request deals
        // again: one silent retry_delay is a better failure than a query
        // storm on the audio path.
        return ['track' => $this->find($playlist, $deck[0]), 'dead' => []];
    }

    /**
     * The first card on the deck that is measured and ends within `$gap`
     * seconds, or null. Only the current deck: a song from the next cycle
     * would break "every song once before any song twice".
     */
    private function fitFromDeck(Playlist $playlist, float $gap): ?Track
    {
        $raw = DB::table('playlists')->where('id', $playlist->getKey())->value('deck');
        $deck = is_string($raw) ? (json_decode($raw, true) ?: []) : [];

        if ($deck === []) {
            return null;
        }

        $candidates = $playlist->tracks()
            ->whereIn('tracks.id', $deck)
            ->whereNotNull('tracks.duration_measured_at')
            ->get()
            ->keyBy('id');

        foreach ($deck as $id) {
            $track = $candidates->get($id);
            $airtime = $track?->airtimeSeconds();

            if ($airtime !== null && $airtime <= $gap + self::FIT_TOLERANCE) {
                return $track;
            }
        }

        return null;
    }

    /**
     * Take `$track` off the deck (wherever it sits — a fit pick need not be
     * the top card), along with the dead IDs peekShuffled() passed over.
     *
     * One short transaction with the playlist row locked, so this and
     * dealIn()'s splice (which runs under PlaylistTracks::lock) serialise
     * instead of racing: without it a track added while this boundary was in
     * flight could be written into the deck and then overwritten by the copy
     * read a moment earlier, and would wait for the next deal. Same lock
     * order as PlaylistTracks — playlist row first — so the two cannot
     * deadlock.
     *
     * @param  list<string>  $dead
     */
    private function consumeShuffled(Playlist $playlist, Track $track, array $dead): void
    {
        DB::transaction(function () use ($playlist, $track, $dead) {
            $raw = DB::table('playlists')
                ->where('id', $playlist->getKey())
                ->lockForUpdate()
                ->value('deck');
            $deck = is_string($raw) ? (json_decode($raw, true) ?: []) : [];

            $remove = [...$dead, $track->getKey()];
            $deck = array_values(array_filter($deck, fn (string $id): bool => ! in_array($id, $remove, true)));

            // Refill EAGERLY, the moment the deck runs dry, rather than lazily
            // on the next request. This is the only place the seam is cheap to
            // fix: the track that ends this deck is right here in hand, so the
            // new deck can be dealt away from it without persisting "last
            // played" anywhere.
            if ($deck === []) {
                $deck = $this->deal($playlist, avoidHead: $track->getKey());
            }

            $this->persistDeck($playlist, $deck);
        });
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
     * Straight to the query builder for exactly the reason consumeSequential()
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
