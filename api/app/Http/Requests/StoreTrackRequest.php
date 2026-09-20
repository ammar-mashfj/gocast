<?php

namespace App\Http\Requests;

use App\Models\Track;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Multi-file upload validation. Field name is `files[]` (Laravel array
 * notation); each entry must be an audio file under the size cap. Single-
 * file uploads work too — clients post `files[0]`.
 *
 * `kind` chooses the destination list and defaults to the rotation, so
 * existing clients that never send it keep working unchanged.
 *
 * Authorization is on the parent station, not the (yet to exist) track —
 * the controller resolves the station from the route slug.
 */
class StoreTrackRequest extends FormRequest
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
            'kind' => ['sometimes', Rule::in(Track::KINDS)],
            // Where a music upload lands. Absent, it joins the station's
            // default playlist, so "upload it and it plays" stays true.
            // Ignored for jingles, which are never playlist members.
            'playlist_id' => [
                'sometimes',
                'nullable',
                'ulid',
                Rule::exists('playlists', 'id')->where('station_id', $this->route('station')->id),
            ],
            'files' => ['required', 'array', 'min:1', 'max:30'],
            'files.*' => [
                'required',
                'file',
                // 300 MB per file. An hour-long DJ mix is ~86 MB at 192
                // kbps and ~144 MB at 320, so the previous 50 MB ceiling
                // rejected the single most important file type outright.
                // The per-station cumulative cap is enforced separately in
                // TrackImporter::ensureWithinQuota.
                'max:307200',
                'mimes:mp3,m4a,aac,flac,ogg,wav,mpga',
            ],
        ];
    }

    public function kind(): string
    {
        return (string) $this->validated('kind', Track::KIND_MUSIC);
    }

    public function playlistId(): ?string
    {
        $id = $this->validated('playlist_id');

        return $id === null ? null : (string) $id;
    }
}
