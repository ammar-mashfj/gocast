<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates file uploads for images and sounds.
 *
 * MIME types and size limits are resolved from the TYPES constant based on
 * the {type} route parameter, so a single endpoint handles both media kinds.
 */
class UploadRequest extends FormRequest
{
    public const TYPES = [
        'images' => [
            'mimes' => 'jpg,jpeg,png,webp,gif',
            'max' => 5120, // 5MB
        ],
        'sounds' => [
            'mimes' => 'mp3,wav,ogg,flac,aac',
            'max' => 51200, // 50MB
        ],
    ];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $type = $this->route('type');
        $config = self::TYPES[$type] ?? self::TYPES['images'];

        return [
            'file' => ['required', 'file', 'mimes:'.$config['mimes'], 'max:'.$config['max']],
        ];
    }
}
