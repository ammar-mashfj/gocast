<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates station updates.
 *
 * Slug is system-owned and immutable — it is generated once on creation and
 * never exposed for update. Any "slug" key in the payload is ignored.
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
        ];
    }
}
