<?php

namespace App\Http\Requests;

use App\Models\Track;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTrackRequest extends FormRequest
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
            'title' => ['sometimes', 'string', 'max:200'],
            'artist' => ['sometimes', 'nullable', 'string', 'max:200'],
            // Moves a jingle to another of its station's lists.
            'jingle_list_id' => [
                'sometimes',
                'ulid',
                Rule::prohibitedIf(fn (): bool => $this->track()?->kind !== Track::KIND_JINGLE),
                Rule::exists('jingle_lists', 'id')->where('station_id', $this->track()?->station_id),
            ],
        ];
    }

    private function track(): ?Track
    {
        $track = $this->route('track');

        return $track instanceof Track ? $track : null;
    }
}
