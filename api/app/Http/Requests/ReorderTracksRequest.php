<?php

namespace App\Http\Requests;

use App\Models\Track;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Reordering is scoped to one kind — positions are a separate sequence for
 * the rotation and for jingles. The `exists` rule is narrowed to match, so
 * passing a jingle id into a rotation reorder fails validation instead of
 * quietly renumbering the wrong list.
 */
class ReorderTracksRequest extends FormRequest
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
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => [
                'required',
                'ulid',
                Rule::exists('tracks', 'id')
                    ->where('station_id', $this->route('station')->id)
                    ->where('kind', $this->kind()),
            ],
        ];
    }

    public function kind(): string
    {
        $kind = $this->input('kind', Track::KIND_MUSIC);

        return in_array($kind, Track::KINDS, true) ? $kind : Track::KIND_MUSIC;
    }
}
