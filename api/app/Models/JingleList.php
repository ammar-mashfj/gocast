<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\JingleListFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * One list of jingles and the one rule that plays it:
 *
 *   "Play a [pick] jingle from [name] [how often], [when]."
 *
 * AutoDjScheduler asks isDueAt() at every track boundary, with the time the
 * next track will START (Laravel's clock), not the time of the request. The
 * rotation state (`deck`, `cursor_position`, `songs_since`,
 * `last_played_at`) is written with the query builder there, never through
 * this model, for the same reason as Playlist's.
 *
 * @property string $id
 * @property string $station_id
 * @property string $name
 * @property bool $enabled
 * @property string $pick PICK_RANDOM | PICK_IN_ORDER | PICK_SINGLE
 * @property string|null $pinned_track_id the clip PICK_SINGLE plays
 * @property string $frequency FREQUENCY_MINUTES | FREQUENCY_SONGS | FREQUENCY_TIMES
 * @property int|null $every_minutes
 * @property int|null $every_songs
 * @property list<string>|null $times "HH:MM" wall clocks, sorted
 * @property bool $exact at set times: fade the song so the jingle is on time
 * @property list<int>|null $days 0 = Sunday; null = every day
 * @property string|null $from_time "HH:MM:SS"; null with to_time = all day
 * @property string|null $to_time at or before from_time runs past midnight
 * @property int $position
 * @property list<string>|null $deck unplayed remainder of the shuffle, as track IDs
 * @property int|null $cursor_position track position last played (in order)
 * @property int $songs_since music tracks served since this list last played
 * @property CarbonImmutable|null $last_played_at planned start of its last jingle
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class JingleList extends Model
{
    /** @use HasFactory<JingleListFactory> */
    use HasFactory, HasUlids;

    /** A random clip, none repeated until every clip has played. */
    public const PICK_RANDOM = 'random';

    /** Each clip in list order, wrapping at the end. */
    public const PICK_IN_ORDER = 'in_order';

    /** Always the same clip (`pinned_track_id`). */
    public const PICK_SINGLE = 'single';

    /** @var list<string> */
    public const PICKS = [self::PICK_RANDOM, self::PICK_IN_ORDER, self::PICK_SINGLE];

    public const FREQUENCY_MINUTES = 'minutes';

    public const FREQUENCY_SONGS = 'songs';

    public const FREQUENCY_TIMES = 'times';

    /** @var list<string> */
    public const FREQUENCIES = [self::FREQUENCY_MINUTES, self::FREQUENCY_SONGS, self::FREQUENCY_TIMES];

    /**
     * How late a set-time jingle may still play. "At 08:00" means the first
     * break after 08:00, which a long song can push back several minutes —
     * but a station that was off air or live at 08:00 should not open with
     * the 08:00 ID at 09:40.
     */
    public const SET_TIME_GRACE_SECONDS = 1800;

    /** @var list<string> */
    protected $fillable = [
        'name', 'enabled', 'pick', 'pinned_track_id', 'frequency', 'every_minutes', 'every_songs',
        'times', 'exact', 'days', 'from_time', 'to_time', 'position',
    ];

    /** @var array<string, mixed> */
    protected $attributes = [
        'enabled' => true,
        'pick' => self::PICK_RANDOM,
        'frequency' => self::FREQUENCY_SONGS,
        'every_songs' => 4,
        'exact' => false,
        'position' => 0,
        'songs_since' => 0,
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'every_minutes' => 'integer',
            'every_songs' => 'integer',
            'times' => 'array',
            'exact' => 'boolean',
            'days' => 'array',
            'position' => 'integer',
            'deck' => 'array',
            'cursor_position' => 'integer',
            'songs_since' => 'integer',
            'last_played_at' => 'immutable_datetime',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    /** The list's clips, in play order. */
    public function tracks(): HasMany
    {
        return $this->hasMany(Track::class)
            ->where('kind', Track::KIND_JINGLE)
            ->orderBy('position')
            ->orderBy('created_at');
    }

    /** Set-time lists whose jingle must start exactly on time. */
    public function isExact(): bool
    {
        return $this->frequency === self::FREQUENCY_TIMES && $this->exact;
    }

    /**
     * Is the list's "when" open at `$at`?
     *
     * Days are the weekdays a window STARTS on, as for AutoDJ slots, so a
     * Friday 22:00–02:00 window still covers Saturday 01:00.
     */
    public function isOpenAt(CarbonImmutable $at, string $timezone): bool
    {
        $local = $at->setTimezone($timezone);
        $days = $this->days === null ? null : array_map('intval', $this->days);
        $onDay = fn (CarbonImmutable $day): bool => $days === null || in_array((int) $day->dayOfWeek, $days, true);

        if ($this->from_time === null || $this->to_time === null) {
            return $onDay($local);
        }

        $minute = $local->hour * 60 + $local->minute;
        $from = self::minutes($this->from_time);
        $to = self::minutes($this->to_time);

        if ($from < $to) {
            return $onDay($local) && $minute >= $from && $minute < $to;
        }

        // Runs past midnight: tonight's window, or the tail of last night's.
        return ($onDay($local) && $minute >= $from)
            || ($onDay($local->subDay()) && $minute < $to);
    }

    /**
     * The set times that fall in [$from, $to], as instants, earliest first —
     * only those on an open day and inside the window.
     *
     * Anchored with setTime() after the date arithmetic, as AutodjSlot does,
     * so 08:00 stays 08:00 across a DST change.
     *
     * @return list<CarbonImmutable>
     */
    public function setTimesBetween(CarbonImmutable $from, CarbonImmutable $to, string $timezone): array
    {
        if ($this->frequency !== self::FREQUENCY_TIMES || empty($this->times)) {
            return [];
        }

        $instants = [];
        $day = $from->setTimezone($timezone)->startOfDay();
        $last = $to->setTimezone($timezone)->startOfDay();

        while ($day <= $last) {
            foreach ($this->times as $time) {
                [$hour, $minute] = array_map('intval', explode(':', $time));
                $instant = $day->setTime($hour, $minute);

                if ($instant >= $from && $instant <= $to && $this->isOpenAt($instant, $timezone)) {
                    $instants[] = $instant;
                }
            }

            $day = $day->addDay()->startOfDay();
        }

        sort($instants);

        return $instants;
    }

    /**
     * Should this list play at the break that starts at `$at`?
     *
     * Ignores whether the list has clips and whether a jingle just played;
     * the scheduler checks both.
     */
    public function isDueAt(CarbonImmutable $at, string $timezone): bool
    {
        if (! $this->enabled) {
            return false;
        }

        if ($this->frequency === self::FREQUENCY_TIMES) {
            return $this->dueSetTime($at, $timezone) !== null;
        }

        if (! $this->isOpenAt($at, $timezone)) {
            return false;
        }

        return match ($this->frequency) {
            self::FREQUENCY_MINUTES => $this->last_played_at === null
                || $at->greaterThanOrEqualTo($this->last_played_at->addMinutes(max(1, (int) $this->every_minutes))),
            self::FREQUENCY_SONGS => $this->songs_since >= max(1, (int) $this->every_songs),
            default => false,
        };
    }

    /**
     * The set time this list owes a jingle for at `$at`: the latest one at
     * or before it, not yet played, and no more than the grace period ago.
     *
     * A second of slack, because an exact-time jingle is planned to start
     * precisely on the time and a float rounding must not make it "not yet".
     */
    public function dueSetTime(CarbonImmutable $at, string $timezone): ?CarbonImmutable
    {
        $times = $this->setTimesBetween(
            $at->subSeconds(self::SET_TIME_GRACE_SECONDS),
            $at->addSecond(),
            $timezone,
        );

        $latest = end($times) ?: null;

        if ($latest === null) {
            return null;
        }

        if ($this->last_played_at !== null && $this->last_played_at->greaterThanOrEqualTo($latest)) {
            return null;
        }

        return $latest;
    }

    private static function minutes(string $time): int
    {
        [$hour, $minute] = array_map('intval', explode(':', $time));

        return $hour * 60 + $minute;
    }
}
