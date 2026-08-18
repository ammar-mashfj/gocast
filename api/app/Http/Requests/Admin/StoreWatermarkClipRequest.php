<?php

namespace App\Http\Requests\Admin;

use App\Services\WatermarkClipLibrary;
use Illuminate\Foundation\Http\FormRequest;

class StoreWatermarkClipRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'clip' => [
                'required',
                'file',
                // Extension AND max size are both enforced again in the
                // library: this request is the friendly error, that one is the
                // guarantee, and only one of them is reachable from a CLI.
                'mimes:'.implode(',', WatermarkClipLibrary::ALLOWED_EXTENSIONS),
                'max:'.(int) (config('liquidsoap.watermark_clip_max_bytes') / 1024),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'clip.mimes' => 'Liquidsoap can only play '.implode(', ', WatermarkClipLibrary::ALLOWED_EXTENSIONS).' files.',
        ];
    }
}
