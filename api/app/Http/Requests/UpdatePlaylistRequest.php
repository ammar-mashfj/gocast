<?php

namespace App\Http\Requests;

use App\Models\Playlist;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePlaylistRequest extends FormRequest
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
            'name' => [
                'sometimes',
                'string',
                'max:60',
                Rule::unique('playlists', 'name')
                    ->where('station_id', $playlist->station_id)
                    ->ignore($playlist->getKey()),
            ],
            // Switching costs nothing and disturbs nothing: it is read per
            // track by AutoDjScheduler, never rendered into the .liq.
            'order' => ['sometimes', Rule::in(Playlist::ORDERS)],
            // Only ever TRUE. The default moves by being claimed, never by
            // being given up — a station with no default has nothing to play
            // when no slot is active. `accepted` is exactly "must be true".
            'is_default' => ['sometimes', 'accepted'],
        ];
    }
}
