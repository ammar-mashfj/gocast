<?php

namespace App\Http\Requests;

use App\Models\Playlist;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Authorization is on the parent station (PlaylistPolicy::create) — the
 * controller resolves it from the route slug.
 */
class StorePlaylistRequest extends FormRequest
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
        return [
            'name' => [
                'required',
                'string',
                'max:60',
                // Two playlists called "Chill" on one station would be two
                // identical entries in every dropdown the schedule shows.
                Rule::unique('playlists', 'name')->where('station_id', $this->route('station')->id),
            ],
            'order' => ['sometimes', Rule::in(Playlist::ORDERS)],
        ];
    }
}
