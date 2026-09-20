<?php

namespace App\Http\Requests;

use App\Models\Station;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a full replacement of a station's AutoDJ programming slots.
 *
 * Same shape as the show-times request, for the same reasons — a short
 * ordered list the owner edits whole, with the timezone riding along because
 * a wall clock without a zone is not a time — but deliberately not the same
 * class: the two lists are different objects with different consumers, and
 * this one is read by the audio path.
 *
 * Two things the show times never needed:
 *
 *   • an END time, because "what plays now" must be answerable; at or before
 *     the start means the slot runs past midnight;
 *   • NO OVERLAPS, because the resolver must never have to rank two slots.
 *     Touching is fine (one ends 12:00, the next starts 12:00). Checked over
 *     one canonical week in minutes, with wrap past Saturday midnight, so a
 *     Friday 22:00–02:00 slot is caught colliding with a Saturday 00:00 one.
 */
class ReplaceAutodjSlotsRequest extends FormRequest
{
    private const MINUTES_PER_DAY = 1440;

    private const MINUTES_PER_WEEK = 7 * self::MINUTES_PER_DAY;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var Station $station */
        $station = $this->route('station');

        return [
            'timezone' => ['nullable', 'timezone:all'],
            // A week has 168 hours; 50 slots is a sanity bound well past
            // any programme grid a person would draw by hand.
            'slots' => ['present', 'array', 'max:50'],
            'slots.*.label' => ['nullable', 'string', 'max:60'],
            'slots.*.playlist_id' => [
                'required',
                'ulid',
                Rule::exists('playlists', 'id')->where('station_id', $station->id),
            ],
            'slots.*.days' => ['required', 'array', 'min:1', 'max:7'],
            // No `distinct` here: on a wildcard path Laravel compares the
            // values across EVERY slot, so two slots on Monday would be
            // "duplicates". The controller dedupes within a row instead.
            'slots.*.days.*' => ['integer', 'between:0,6'],
            'slots.*.start_time' => ['required', 'date_format:H:i'],
            'slots.*.end_time' => ['required', 'date_format:H:i'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'slots.*.playlist_id.required' => 'Pick a playlist for each slot.',
            'slots.*.playlist_id.exists' => 'That playlist is not on this station.',
            'slots.*.days.required' => 'Pick at least one day for each slot.',
            'slots.*.start_time.date_format' => 'Times look like 06:00.',
            'slots.*.end_time.date_format' => 'Times look like 12:00.',
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                /** @var Station $station */
                $station = $this->route('station');
                $timezone = $this->has('timezone') ? $this->input('timezone') : $station->timezone;

                // The zone is shared with the show times. Clearing it here
                // would leave every advertised show time a number with no
                // meaning — the same guard UpdateStationRequest applies.
                if ($timezone === null && $station->timezone !== null && $station->schedules()->exists()) {
                    $validator->errors()->add(
                        'timezone',
                        "Remove the station's show times before clearing its timezone.",
                    );

                    return;
                }

                $rows = $this->validated('slots', []);

                if ($rows === []) {
                    return;
                }

                if ($timezone === null) {
                    $validator->errors()->add('timezone', 'Set the station timezone before adding slots.');

                    return;
                }

                $this->checkOverlaps($validator, $rows);
            },
        ];
    }

    /**
     * @param  list<array{label?: ?string, days: list<int|string>, start_time: string, end_time: string}>  $rows
     */
    private function checkOverlaps(Validator $validator, array $rows): void
    {
        /** @var list<array{0: int, 1: int, 2: int}> $windows [start, end, row index] */
        $windows = [];

        foreach ($rows as $index => $row) {
            $start = self::minutes($row['start_time']);
            $duration = self::minutes($row['end_time']) - $start;
            if ($duration <= 0) {
                $duration += self::MINUTES_PER_DAY;
            }

            foreach ($row['days'] as $day) {
                $from = ((int) $day) * self::MINUTES_PER_DAY + $start;
                $to = $from + $duration;

                if ($to > self::MINUTES_PER_WEEK) {
                    $windows[] = [$from, self::MINUTES_PER_WEEK, $index];
                    $windows[] = [0, $to - self::MINUTES_PER_WEEK, $index];
                } else {
                    $windows[] = [$from, $to, $index];
                }
            }
        }

        usort($windows, fn (array $a, array $b) => $a[0] <=> $b[0] ?: $a[1] <=> $b[1]);

        for ($i = 1; $i < count($windows); $i++) {
            [$prevStart, $prevEnd, $prevRow] = $windows[$i - 1];
            [$start, , $row] = $windows[$i];

            if ($start < $prevEnd) {
                $validator->errors()->add(
                    "slots.{$row}.start_time",
                    sprintf(
                        '%s overlaps %s. Slots can touch but not overlap.',
                        self::describe($rows[$row], $row),
                        self::describe($rows[$prevRow], $prevRow),
                    ),
                );

                return;
            }
        }
    }

    private static function minutes(string $time): int
    {
        [$hour, $minute] = array_map('intval', explode(':', $time));

        return $hour * 60 + $minute;
    }

    /**
     * @param  array{label?: ?string, days: list<int|string>, start_time: string, end_time: string}  $row
     */
    private static function describe(array $row, int $index): string
    {
        $name = trim((string) ($row['label'] ?? ''));

        return sprintf(
            '%s (%s–%s)',
            $name !== '' ? $name : 'Slot '.($index + 1),
            $row['start_time'],
            $row['end_time'],
        );
    }
}
