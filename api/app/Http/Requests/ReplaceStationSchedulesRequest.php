<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a full replacement of a station's advertised show times.
 *
 * Full replacement rather than per-row CRUD: the editor is a short list the
 * owner adds to, deletes from and reorders, and sending it whole turns three
 * endpoints (create, delete, reorder) into one. `position` is the array index,
 * so ordering needs no field of its own.
 *
 * `present` on the array, not `required`: clearing every row is a legitimate
 * edit, and `required` rejects an empty array.
 *
 * The timezone rides along rather than going through the station endpoint,
 * because the two halves are meaningless apart: a wall clock with no zone is
 * not a time, and changing the zone reinterprets every row under it. Sent as
 * two requests, a failure between them would leave the zone moved and the
 * times it applies to unchanged — every advertised show silently hours out,
 * reported to the owner as a save that failed.
 */
class ReplaceStationSchedulesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'timezone' => ['nullable', 'timezone:all'],
            // 20 is a sanity bound, not a product limit. A station with more
            // advertised slots than that is describing a grid, which is §2's
            // job, not a claim a listener can hold in their head.
            'schedules' => ['present', 'array', 'max:20'],
            'schedules.*.label' => ['nullable', 'string', 'max:60'],
            // At least one day: a show time on no days is invisible, and
            // storing it would mean the editor can save a row that never
            // renders.
            'schedules.*.days' => ['required', 'array', 'min:1', 'max:7'],
            'schedules.*.days.*' => ['integer', 'between:0,6', 'distinct'],
            // Wall clock only. Seconds and offsets are both rejected: the
            // first is noise, the second would be a second source of truth
            // about the zone, which stations.timezone already owns.
            'schedules.*.start_time' => ['required', 'date_format:H:i'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'schedules.*.days.required' => 'Pick at least one day for each show time.',
            'schedules.*.start_time.date_format' => 'Show times look like 20:00.',
        ];
    }
}
