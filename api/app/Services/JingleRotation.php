<?php

namespace App\Services;

use App\Models\JingleList;
use App\Models\Station;
use App\Models\Track;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Which jingle, if any, plays at a break. The jingle half of
 * AutoDjScheduler, kept apart because it has its own state per list.
 *
 * Every question is asked at the time the break STARTS (Laravel's clock),
 * never at the time of the request. Collisions resolve to one jingle per
 * break: a set-time list beats an interval list (an exact one first), then
 * the list that has waited longest; the loser waits for the next break.
 *
 * Rotation state is written with the query builder, like a playlist's
 * cursor: a track boundary is not an edit.
 */
class JingleRotation
{
    /**
     * The jingle due at the break starting at `$at`, as [list, track], or
     * null when no list is due (or none that is due has a clip to play).
     *
     * @return array{0: JingleList, 1: Track}|null
     */
    public function due(Station $station, CarbonImmutable $at): ?array
    {
        $timezone = $station->timezone ?? 'UTC';

        $due = $station->jingleLists
            ->filter(fn (JingleList $list): bool => $list->isDueAt($at, $timezone))
            ->sortBy(fn (JingleList $list): array => [
                $list->frequency === JingleList::FREQUENCY_TIMES ? ($list->exact ? 0 : 1) : 2,
                $list->last_played_at?->getTimestampMs() ?? 0,
                $list->position,
            ]);

        foreach ($due as $list) {
            $track = $this->pick($list);

            if ($track !== null) {
                return [$list, $track];
            }
        }

        return null;
    }

    /**
     * A clip to fill the gap before a hard slot start, as [list, track]:
     * the longest one that fits in `$gap` seconds and leaves less than
     * `$leftover` over, from any switched-on list whose "when" is open at
     * `$at`. Only measured clips: a guessed length cannot be trusted to fit.
     *
     * @return array{0: JingleList, 1: Track}|null
     */
    public function filler(Station $station, CarbonImmutable $at, float $gap, float $leftover): ?array
    {
        $timezone = $station->timezone ?? 'UTC';
        $best = null;

        foreach ($station->jingleLists as $list) {
            if (! $list->enabled || ! $list->isOpenAt($at, $timezone)) {
                continue;
            }

            foreach ($list->tracks()->whereNotNull('duration_measured_at')->get() as $track) {
                $airtime = $track->airtimeSeconds();

                if ($airtime === null || $airtime > $gap || $gap - $airtime >= $leftover) {
                    continue;
                }

                if ($best === null || $airtime > $best[2]) {
                    $best = [$list, $track, $airtime];
                }
            }
        }

        return $best === null ? null : [$best[0], $best[1]];
    }

    /**
     * Mark `$list` as having played `$track` at the break starting at `$at`.
     */
    public function played(JingleList $list, Track $track, CarbonImmutable $at): void
    {
        $list->last_played_at = $at;
        $list->songs_since = 0;
        // DB::table bypasses the casts, so the row gets its own encoding.
        $update = [
            'last_played_at' => $at->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s.v'),
            'songs_since' => 0,
        ];

        if ($list->pick === JingleList::PICK_IN_ORDER) {
            $list->cursor_position = $update['cursor_position'] = $track->position;
        }

        if ($list->pick === JingleList::PICK_RANDOM) {
            $list->deck = $this->deckAfter($list, $track);
            $update['deck'] = json_encode($list->deck);
        }

        DB::table('jingle_lists')->where('id', $list->getKey())->update($update);
        $list->syncOriginal();
    }

    /**
     * A music track was served: every list counting songs moves on one.
     */
    public function songPlayed(Station $station): void
    {
        DB::table('jingle_lists')->where('station_id', $station->getKey())->increment('songs_since');

        foreach ($station->jingleLists as $list) {
            $list->songs_since++;
            $list->syncOriginalAttribute('songs_since');
        }
    }

    /**
     * The clip this list would play next, without playing it.
     */
    private function pick(JingleList $list): ?Track
    {
        /** @var Collection<int, Track> $tracks */
        $tracks = $list->tracks()->get();

        if ($tracks->isEmpty()) {
            return null;
        }

        return match ($list->pick) {
            JingleList::PICK_SINGLE => $tracks->firstWhere('id', $list->pinned_track_id) ?? $tracks->first(),
            JingleList::PICK_IN_ORDER => $list->cursor_position === null
                ? $tracks->first()
                : ($tracks->first(fn (Track $t): bool => $t->position > $list->cursor_position) ?? $tracks->first()),
            default => $this->deckHead($list, $tracks),
        };
    }

    /**
     * The first clip on the shuffle deck that is still in the list, dealing
     * a fresh deck when the stored one is empty or entirely stale.
     *
     * @param  Collection<int, Track>  $tracks
     */
    private function deckHead(JingleList $list, Collection $tracks): Track
    {
        $byId = $tracks->keyBy('id');

        foreach ($list->deck ?? [] as $id) {
            if ($byId->has($id)) {
                return $byId->get($id);
            }
        }

        $deck = $this->deal($tracks);
        $list->deck = $deck;

        return $byId->get($deck[0]);
    }

    /**
     * The deck once `$track` has played: everything after it, or a fresh
     * deal (not starting with `$track`) when that leaves nothing.
     *
     * @return list<string>
     */
    private function deckAfter(JingleList $list, Track $track): array
    {
        $tracks = $list->tracks()->get();
        $ids = $tracks->pluck('id')->map(fn ($id) => (string) $id)->all();

        $deck = array_values(array_filter(
            $list->deck ?? [],
            fn (string $id): bool => $id !== $track->getKey() && in_array($id, $ids, true),
        ));

        return $deck !== [] ? $deck : $this->deal($tracks, avoidHead: $track->getKey());
    }

    /**
     * @param  Collection<int, Track>  $tracks
     * @return list<string>
     */
    private function deal(Collection $tracks, ?string $avoidHead = null): array
    {
        $deck = $tracks->pluck('id')->map(fn ($id) => (string) $id)->all();
        shuffle($deck);

        if ($avoidHead !== null && count($deck) > 1 && $deck[0] === $avoidHead) {
            $swap = random_int(1, count($deck) - 1);
            [$deck[0], $deck[$swap]] = [$deck[$swap], $deck[0]];
        }

        return $deck;
    }
}
