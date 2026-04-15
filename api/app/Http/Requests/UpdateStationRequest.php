<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates station updates.
 *
 * Slug uniqueness check excludes the current station so the owner can keep
 * their existing slug while updating other fields.
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
            'slug' => ['sometimes', 'string', 'max:60', 'unique:stations,slug,'.$this->route('station')->id, 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'description' => ['nullable', 'string'],
            'genre' => ['nullable', 'string', 'max:255'],
            'artwork_url' => ['nullable', 'string', 'url', 'max:2048'],
            'social_links' => ['nullable', 'array'],
            'theme_config' => ['nullable', 'array'],
        ];
    }
}
