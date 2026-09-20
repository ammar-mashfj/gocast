<?php

namespace App\Http\Requests;

use App\Models\Playlist;
use App\Models\Track;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A set of tracks to put in a playlist — the body of both "append these"
 * (POST) and "make it exactly these" (PUT).
 *
 * `present` rather than `required`: PUT with an empty list is how a
 * playlist is emptied, and that is a legitimate edit. POST with an empty
 * list is a no-op the controller tolerates for the same reason.
 *
 * Every ID must be one of THIS station's MUSIC tracks. Jingles have their
 * own arm in the audio graph and must never become a rotation entry; a
 * track from another station would be a cross-tenant read on the audio path.
 */
class PlaylistTracksRequest extends FormRequest
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
        /** @var Playlist $playlist */
        $playlist = $this->route('playlist');

        return [
            'track_ids' => ['present', 'array', 'max:2000'],
            'track_ids.*' => [
                'required',
                'ulid',
                'distinct',
                Rule::exists('tracks', 'id')
                    ->where('station_id', $playlist->station_id)
                    ->where('kind', Track::KIND_MUSIC),
            ],
        ];
    }

    /** @return list<string> */
    public function trackIds(): array
    {
        return array_values(array_map('strval', $this->validated('track_ids', [])));
    }
}
