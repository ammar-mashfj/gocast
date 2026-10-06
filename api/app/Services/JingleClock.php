<?php

namespace App\Services;

use App\Models\Station;
use App\Models\Track;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * When a station's jingle plays, and which one.
 *
 * This used to be Liquidsoap's call: a randomised jingles.m3u behind a delay()
 * and a track counter in the rendered script. It moved here so a jingle can be
 * planned like a song — at a set time past the hour, with AutoDjScheduler
 * picking songs that end before it — which nothing inside Liquidsoap can do,
 * because Liquidsoap does not know how long the songs after this one are.
 *
 * Every question is asked at a track's PLANNED start (`$at`), not at now:
 * the container asks for track N+1 while track N is still playing.
 *
 * The three modes stay one-at-a-time, as the settings card has always offered
 * them, so two rules can never compete for the same break.
 */
class JingleClock
{
    /**
     * How late a set-time jingle may still play. Normally it is on time to
     * within a second or two; it is late only when something held AutoDJ off
     * the air across the time — a live show, the station being off. An ID
     * meant for 08:00 playing at 08:00:40 is fine; at 08:25 it is just wrong,
     * and the next set time is the better one to wait for.
     */
    public const LATE_GRACE_SECONDS = 60.0;

    /**
     * Whether the station plays jingles at all right now. The plan gate is
     * AutoDjScheduler's, checked before anything here is asked.
     */
    public function enabled(Station $station): bool
    {
        if (! $station->jingles_enabled) {
            return false;
        }

        if ($station->jingle_mode === Station::JINGLE_MODE_TIMES && $this->minutes($station) === []) {
            return false;
        }

        return $station->jingles()->exists();
    }

    /**
     * The set time a jingle should play for at `$at`, or null.
     *
     * Due from the early-start window before the time (the planner starts it a
     * few seconds early rather than cut a song for it) until LATE_GRACE after.
     * A time is spent once a jingle has been planned at or after it, which is
     * what stops the same :00 firing twice.
     */
    public function setTimeDue(Station $station, CarbonImmutable $at, float $earlySeconds): ?CarbonImmutable
    {
        if ($station->jingle_mode !== Station::JINGLE_MODE_TIMES) {
            return null;
        }

        $last = $this->lastAt($station);
        $latest = $this->setTimeAtOrBefore($station, $at->addMilliseconds((int) round($earlySeconds * 1000)));

        if ($latest === null || ($last !== null && $latest <= $last)) {
            return null;
        }

        if ($at->floatDiffInSeconds($latest, false) < -self::LATE_GRACE_SECONDS) {
            return null;
        }

        return $latest;
    }

    /**
     * The next set time strictly after `$after`, or null when the station is
     * not in set-times mode. AutoDjScheduler plans songs to end before it.
     */
    public function nextSetTime(Station $station, CarbonImmutable $after): ?CarbonImmutable
    {
        $minutes = $station->jingle_mode === Station::JINGLE_MODE_TIMES ? $this->minutes($station) : [];

        if ($minutes === []) {
            return null;
        }

        $local = $after->setTimezone($this->timezone($station));
        $hour = $local->startOfHour();

        // This hour and the next always contain the answer.
        foreach ([$hour, $hour->addHour()] as $base) {
            foreach ($minutes as $minute) {
                $candidate = $base->addMinutes($minute);
                if ($candidate > $local) {
                    return $candidate->setTimezone($after->getTimezone());
                }
            }
        }

        return null;
    }

    /**
     * Whether an every-N-minutes or every-N-songs jingle is due at `$at`.
     *
     * An interval station that has never played a jingle starts its clock
     * here rather than opening with one. One that has is restarted by
     * containerStarted() instead.
     */
    public function breakDue(Station $station, CarbonImmutable $at): bool
    {
        return match ($station->jingle_mode) {
            Station::JINGLE_MODE_TRACKS => (int) $station->autodj_songs_since_jingle >= max(1, (int) $station->jingle_every_tracks),
            Station::JINGLE_MODE_INTERVAL => $this->intervalDue($station, $at),
            default => false,
        };
    }

    /**
     * Any jingle but the one played last, so a station with two IDs alternates
     * and one with a single ID still plays it.
     */
    public function pick(Station $station): ?Track
    {
        $query = $station->jingles()->reorder();

        if ($station->autodj_last_jingle_id !== null) {
            $other = (clone $query)->whereKeyNot($station->autodj_last_jingle_id)->inRandomOrder()->first();
            if ($other !== null) {
                return $other;
            }
        }

        return $query->inRandomOrder()->first();
    }

    /**
     * Record a jingle handed out to start at `$at`. For a set-time jingle
     * that starts a few seconds early, pass the set time itself so the time
     * counts as spent.
     */
    public function played(Station $station, Track $jingle, CarbonImmutable $at): void
    {
        $this->write($station, [
            'autodj_last_jingle_at' => $at->utc()->format('Y-m-d H:i:s.v'),
            'autodj_last_jingle_id' => $jingle->getKey(),
            'autodj_songs_since_jingle' => 0,
        ]);
    }

    /**
     * Restart the interval clock because the station's container is
     * (re)starting, so it does not open on a jingle — the rule the script's
     * delay(initial=true) kept, which counted from boot.
     *
     * Without this the clock runs from the last jingle ever played: a station
     * off overnight is "due" the moment it starts, and opens on an ID after
     * every power-on, relaunch and reconcile.
     *
     * The every-N-songs counter restarts too: it is stored, so songs handed
     * out before the stop (some queued and never played) would otherwise
     * make the first request a jingle.
     *
     * The clock moves in interval mode only. In set-times mode the column
     * marks which time is spent, and moving it on would skip a time that is
     * still due.
     */
    public function containerStarted(Station $station): void
    {
        $values = ['autodj_songs_since_jingle' => 0];

        if ($station->jingle_mode === Station::JINGLE_MODE_INTERVAL) {
            $values['autodj_last_jingle_at'] = now()->utc()->format('Y-m-d H:i:s.v');
        }

        $this->write($station, $values);
    }

    /** Count a song handed out, for the every-N-songs mode. */
    public function songPlayed(Station $station): void
    {
        $this->write($station, ['autodj_songs_since_jingle' => (int) $station->autodj_songs_since_jingle + 1]);
    }

    private function intervalDue(Station $station, CarbonImmutable $at): bool
    {
        $last = $this->lastAt($station);

        if ($last === null) {
            $this->write($station, ['autodj_last_jingle_at' => $at->utc()->format('Y-m-d H:i:s.v')]);

            return false;
        }

        return $last->floatDiffInSeconds($at, false) >= max(60, (int) $station->jingle_interval_seconds);
    }

    /** The latest set time at or before `$at`. */
    private function setTimeAtOrBefore(Station $station, CarbonImmutable $at): ?CarbonImmutable
    {
        $minutes = $this->minutes($station);

        if ($minutes === []) {
            return null;
        }

        $local = $at->setTimezone($this->timezone($station));
        $hour = $local->startOfHour();

        foreach ([$hour, $hour->subHour()] as $base) {
            foreach (array_reverse($minutes) as $minute) {
                $candidate = $base->addMinutes($minute);
                if ($candidate <= $local) {
                    return $candidate->setTimezone($at->getTimezone());
                }
            }
        }

        return null;
    }

    /** @return list<int> sorted minutes past the hour */
    private function minutes(Station $station): array
    {
        $minutes = array_values(array_unique(array_map('intval', $station->jingle_times ?? [])));
        sort($minutes);

        return array_values(array_filter($minutes, fn (int $m) => $m >= 0 && $m <= 59));
    }

    /**
     * Minutes past the hour are the same in most zones, but not in the ones
     * offset by half or quarter hours (India, Nepal, parts of Australia), so
     * the station's own zone is used when it has one.
     */
    private function timezone(Station $station): string
    {
        return $station->timezone ?? 'UTC';
    }

    private function lastAt(Station $station): ?CarbonImmutable
    {
        return $station->autodj_last_jingle_at === null
            ? null
            : CarbonImmutable::instance($station->autodj_last_jingle_at);
    }

    /**
     * Query builder, not save(): a track boundary is not a station edit, and
     * StationObserver must never see it — the same discipline as the cursor.
     *
     * @param  array<string, mixed>  $values
     */
    private function write(Station $station, array $values): void
    {
        DB::table('stations')->where('id', $station->getKey())->update($values);

        $station->forceFill($values);
        $station->syncOriginalAttributes(array_keys($values));
    }
}
