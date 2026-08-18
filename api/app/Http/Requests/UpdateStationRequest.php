<?php

namespace App\Http\Requests;

use App\Models\Station;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates station updates.
 *
 * Slug is system-owned and immutable — it is generated once on creation and
 * never exposed for update. Any "slug" key in the payload is ignored.
 *
 * The jingle fields are here rather than on their own endpoint because they
 * are rendered into the .liq like name/genre are: StationObserver already
 * watches this table for changes that need the container restarted, and
 * routing them anywhere else would mean a second copy of that logic.
 */
class UpdateStationRequest extends FormRequest
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
            'name' => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'genre' => ['nullable', 'string', 'max:255'],
            'artwork_url' => ['nullable', 'string', 'url', 'max:2048'],
            'social_links' => ['nullable', 'array'],
            'theme_config' => ['nullable', 'array'],
            'jingles_enabled' => ['sometimes', 'boolean'],
            'jingle_mode' => ['sometimes', Rule::in(Station::JINGLE_MODES)],
            // 1 minute floor: below that the delay operator stops being a
            // spacing rule and starts being "a jingle between every track",
            // which is what the rotation is for. 4 hour ceiling is just a
            // sanity bound — anything longer is indistinguishable from off.
            'jingle_interval_seconds' => ['sometimes', 'integer', 'min:60', 'max:14400'],
            // 1 is a legitimate choice (a liner between every song is a real
            // format), so the floor is only there to keep the count gate
            // meaningful — at 0 it would be permanently satisfied.
            'jingle_every_tracks' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
