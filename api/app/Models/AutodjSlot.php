<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\AutodjSlotFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One programming slot: "Morning Calm, weekdays 06:00–12:00".
 *
 * See the create migration for how this differs from a StationSchedule
 * (show time) and why it must never share code with one.
 *
 * @property string $id
 * @property string $station_id
 * @property string $playlist_id
 * @property string|null $label
 * @property array<int, int> $days weekdays the slot STARTS, 0 = Sunday
 * @property string $start_time wall clock "HH:MM:SS" in the station's timezone
 * @property string $end_time wall clock "HH:MM:SS"; at or before start means next day
 * @property int $position display order, owner-controlled
 */
#[Fillable(['station_id', 'playlist_id', 'label', 'days', 'start_time', 'end_time', 'position'])]
class AutodjSlot extends Model
{
    /** @use HasFactory<AutodjSlotFactory> */
    use HasFactory, HasUlids;

    protected function casts(): array
    {
        return [
            'days' => 'array',
            // NOT 'datetime' — wall clocks with no date, see StationSchedule.
            'start_time' => 'string',
            'end_time' => 'string',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    public function playlist(): BelongsTo
    {
        return $this->belongsTo(Playlist::class);
    }

    /**
     * Every concrete window this slot produces whose START falls on a day in
     * [$from, $to], as [start, end] instants in `$timezone`.
     *
     * Built day by day and anchored with setTime() AFTER the date arithmetic,
     * because adding days across a DST change shifts the clock by an hour
     * and the slot is written at a wall-clock time. A window whose end is at
     * or before its start runs into the next day; the end is anchored the
     * same way so a 22:00–02:00 slot is four hours on an ordinary night and
     * three or five on the nights the clocks move — which is what the wall
     * clock says.
     *
     * @return list<array{0: CarbonImmutable, 1: CarbonImmutable}>
     */
    public function windowsBetween(CarbonImmutable $from, CarbonImmutable $to, string $timezone): array
    {
        [$startHour, $startMinute] = self::clock($this->start_time);
        [$endHour, $endMinute] = self::clock($this->end_time);

        $days = array_map('intval', $this->days);
        $windows = [];

        $day = $from->setTimezone($timezone)->startOfDay();
        $last = $to->setTimezone($timezone)->startOfDay();

        while ($day <= $last) {
            if (in_array((int) $day->dayOfWeek, $days, true)) {
                $start = $day->setTime($startHour, $startMinute);
                $end = $day->setTime($endHour, $endMinute);

                if ($end <= $start) {
                    $end = $day->addDay()->setTime($endHour, $endMinute);
                }

                $windows[] = [$start, $end];
            }

            $day = $day->addDay()->startOfDay();
        }

        return $windows;
    }

    /** @return array{0: int, 1: int} */
    private static function clock(string $time): array
    {
        [$hour, $minute] = array_map('intval', explode(':', $time));

        return [$hour, $minute];
    }
}
