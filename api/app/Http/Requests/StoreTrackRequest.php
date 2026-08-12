<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Multi-file upload validation. Field name is `files[]` (Laravel array
 * notation); each entry must be an audio file under the size cap. Single-
 * file uploads work too — clients post `files[0]`.
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
            'files' => ['required', 'array', 'min:1', 'max:30'],
            'files.*' => [
                'required',
                'file',
                // 50 MB per file. The per-station 100 MB cumulative cap is
                // enforced separately in TrackImporter::ensureWithinQuota.
                'max:51200',
                'mimes:mp3,m4a,aac,flac,ogg,wav,mpga',
            ],
        ];
    }
}
