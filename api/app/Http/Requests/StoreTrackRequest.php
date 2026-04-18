<?php

namespace App\Http\Requests;

use App\Models\Station;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates track uploads.
 *
 * Enforces plan-based storage limits and station ownership in authorize().
 */
class StoreTrackRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var Station $station */
        $station = $this->route('station');

        if ($this->user()->id !== $station->user_id) {
            return false;
        }

        $usedBytes = $station->tracks()->sum('file_size');
        $limitBytes = $this->user()->plan->max_storage_mb * 1024 * 1024;
        $newFileSize = $this->file('file')?->getSize() ?? 0;

        return ($usedBytes + $newFileSize) <= $limitBytes;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'mimetypes:audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/aac,audio/mp4,audio/ogg,audio/webm', 'max:204800'],
            'title' => ['nullable', 'string', 'max:255'],
            'artist' => ['nullable', 'string', 'max:255'],
        ];
    }
}
