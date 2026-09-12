<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\StationScheduleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One advertised show time: "Morning Drive, weekdays at 06:00".
 *
 * See the create migration for why this is a start and not a window, and why
 * nothing in the audio path reads it.
 *
 * @property string $id
 * @property string $station_id
 * @property string|null $label
 * @property array<int, int> $days weekdays the show STARTS, 0 = Sunday
 * @property string $start_time wall clock "HH:MM:SS" in the station's timezone
 * @property int $position display order, owner-controlled
 */
#[Fillable(['station_id', 'label', 'days', 'start_time', 'position'])]
class StationSchedule extends Model
{
    /** @use HasFactory<StationScheduleFactory> */
    use HasFactory, HasUlids;

    protected function casts(): array
    {
        return [
            'days' => 'array',
            // NOT 'datetime'. This is a wall clock with no date attached, and
            // casting it to a Carbon instance would invite a comparison
            // against now() that is wrong in every timezone but one.
            'start_time' => 'string',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    /**
     * The next instant this show starts, or null if the station has no
     * timezone set (in which case the wall clock names no instant at all).
     *
     * Computed here rather than in the browser because the client carries no
     * date library — only native Date and Intl — and "the next Sunday at
     * 22:00 in Europe/Madrid" is exactly the arithmetic that DST breaks.
     * PHP's DateTimeZone knows the transition table; hand-rolled offset math
     * does not.
     */
    public function nextOccurrence(?CarbonImmutable $from = null): ?CarbonImmutable
    {
        $timezone = $this->station?->timezone;

        if ($timezone === null) {
            return null;
        }

        $now = ($from ?? CarbonImmutable::now())->setTimezone($timezone);
        [$hour, $minute] = array_map('intval', explode(':', $this->start_time));

        $candidates = [];

        foreach ($this->days as $day) {
            $day = (int) $day;

            // `days` is a JSON column with no constraint behind it, so a
            // seeder or import can write a weekday that does not exist. The
            // arithmetic below would still produce an answer for 7, just the
            // wrong one, and an earlier loop-until-it-matches form of this
            // method would never have returned at all — on an endpoint the
            // whole public internet can reach.
            if ($day < 0 || $day > 6) {
                continue;
            }

            $today = $now->setTime($hour, $minute);

            // setTime again after the jump, not just before: adding days
            // across a DST change shifts the clock by an hour, and the show
            // is advertised at a wall-clock time, not at an offset from one.
            $candidate = $today->addDays(($day - (int) $today->dayOfWeek + 7) % 7)->setTime($hour, $minute);

            if ($candidate <= $now) {
                $candidate = $candidate->addDays(7)->setTime($hour, $minute);
            }

            $candidates[] = $candidate;
        }

        if ($candidates === []) {
            return null;
        }

        // DateTimeInterface instances compare directly, so min() is the
        // earliest start across every day this show runs.
        return min($candidates);
    }
}
