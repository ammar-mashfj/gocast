<?php

namespace App\Services;

use App\Models\AutodjSlot;
use App\Models\Playlist;
use App\Models\Station;
use Carbon\CarbonImmutable;

/**
 * Which playlist a station should be drawing from right now.
 *
 * The one place the schedule is interpreted. AutoDjScheduler asks it once per
 * track boundary; StationResource asks it to say "Morning Calm · until 12:00"
 * on the owner's pages. Nothing in Liquidsoap knows a schedule exists — see
 * docs/AUTODJ-SCHEDULING-PLAN.md §2 for why it lives here.
 *
 * Named "programme" rather than "schedule" on purpose: `station_schedules`
 * and everything called Schedule in this codebase is the advertised show
 * times, which the audio path must never read.
 */
class AutoDjProgramme
{
    /**
     * How far ahead to look for the next slot. A week covers every weekly
     * slot; the extra day is the one a cross-midnight window can spill into.
     */
    private const LOOKAHEAD_DAYS = 8;

    /**
     * Resolve the station's programme at `$now`.
     *
     *   playlist — what should play: the active slot's playlist, or the
     *              default when no slot is active or the slot's playlist is
     *              empty. Null only when the station has no default at all.
     *   slot     — the active slot, or null when the default is playing.
     *   until    — when the current answer changes: the active slot's end,
     *              or the next slot's start while the default plays. Null
     *              when nothing is scheduled.
     *   next     — the next slot to start after now, and when.
     *
     * Reads `$station->autodjSlots` and `$station->defaultPlaylist` as
     * relations, so callers on the audio path eager-load them: one query per
     * boundary is the budget, not three.
     *
     * @return array{
     *     playlist: ?Playlist,
     *     slot: ?AutodjSlot,
     *     until: ?CarbonImmutable,
     *     next: ?array{slot: AutodjSlot, starts_at: CarbonImmutable}
     * }
     */
    public function resolve(Station $station, ?CarbonImmutable $now = null): array
    {
        $default = $station->defaultPlaylist;
        $timezone = $station->timezone;
        $slots = $station->autodjSlots;

        // No timezone means no slot can be saved (the request refuses), so a
        // station with slots but no zone is a row edited by hand — treat it
        // as unscheduled rather than guess a zone for it.
        if ($timezone === null || $slots->isEmpty()) {
            return ['playlist' => $default, 'slot' => null, 'until' => null, 'next' => null];
        }

        $now = ($now ?? CarbonImmutable::now())->setTimezone($timezone);

        // Yesterday's windows can still be running (a slot past midnight);
        // nothing older can.
        $from = $now->subDay();
        $to = $now->addDays(self::LOOKAHEAD_DAYS);

        $active = null;
        $activeWindow = null;
        $next = null;

        foreach ($slots as $slot) {
            foreach ($slot->windowsBetween($from, $to, $timezone) as [$start, $end]) {
                if ($start <= $now && $now < $end) {
                    // Overlaps are refused on write, so two matches here mean
                    // a race with an edit. Earliest start wins, deterministically;
                    // the next boundary self-corrects.
                    if ($activeWindow === null || $start < $activeWindow[0]) {
                        $active = $slot;
                        $activeWindow = [$start, $end];
                    }
                } elseif ($start > $now && ($next === null || $start < $next['starts_at'])) {
                    $next = ['slot' => $slot, 'starts_at' => $start];
                }
            }
        }

        if ($active === null) {
            return [
                'playlist' => $default,
                'slot' => null,
                'until' => $next['starts_at'] ?? null,
                'next' => $next,
            ];
        }

        $playlist = $active->playlist;

        // An empty scheduled playlist falls through to the default rather
        // than to silence: the owner scheduled music, not a gap. The default
        // being empty too is the same silence an empty library always was.
        if ($playlist === null || ! $playlist->tracks()->exists()) {
            return [
                'playlist' => $default,
                'slot' => null,
                'until' => $activeWindow[1],
                'next' => $next,
            ];
        }

        return [
            'playlist' => $playlist,
            'slot' => $active,
            'until' => $activeWindow[1],
            'next' => $next,
        ];
    }
}
