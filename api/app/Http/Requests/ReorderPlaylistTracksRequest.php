<?php

namespace App\Http\Requests;

use App\Models\Playlist;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Same contract as ReorderTracksRequest: `ids` is the desired order, and
 * every ID must already be a member of this playlist.
 */
class ReorderPlaylistTracksRequest extends FormRequest
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
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => [
                'required',
                'ulid',
                'distinct',
                Rule::exists('playlist_track', 'track_id')->where('playlist_id', $playlist->getKey()),
            ],
        ];
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_values(array_map('strval', $this->validated('ids')));
    }
}
