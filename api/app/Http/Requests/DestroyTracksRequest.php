<?php

namespace App\Http\Requests;

use App\Models\Station;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The set of files to delete outright, for the library's multi-select.
 *
 * This is the bulk twin of `DELETE /tracks/{track}`, and it exists for a
 * reason beyond saving round trips: every single-track delete rewrites the
 * station's playlist file and tells Liquidsoap to reload it. Twenty deletes
 * one at a time is twenty reloads on a station that may be on air. One
 * request is one reload.
 *
 * `required` rather than `present`: unlike a playlist's membership, an empty
 * delete is never a meaningful edit, and letting it through would turn a
 * client bug into a silent no-op that still reloaded the station.
 *
 * Both kinds are accepted. The library UI only ever selects music, but the
 * importer renumbers per kind, so a jingle in the list is handled correctly
 * rather than corrupting the rotation's positions.
 */
class DestroyTracksRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var Station $station */
        $station = $this->route('station');

        return [
            'track_ids' => ['required', 'array', 'min:1', 'max:2000'],
            'track_ids.*' => [
                'required',
                'ulid',
                'distinct',
                Rule::exists('tracks', 'id')->where('station_id', $station->id),
            ],
        ];
    }

    /** @return list<string> */
    public function trackIds(): array
    {
        return array_values(array_map('strval', $this->validated('track_ids', [])));
    }
}
