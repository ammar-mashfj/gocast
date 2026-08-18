<?php

namespace App\Http\Resources;

use App\Models\Track;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Track
 */
class TrackResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'station_id' => $this->station_id,
            'kind' => $this->kind,
            'title' => $this->title,
            'artist' => $this->artist,
            'duration_seconds' => $this->duration_seconds,
            'file_size_bytes' => $this->file_size_bytes,
            'position' => $this->position,
            'original_filename' => $this->original_filename,
            'created_at' => $this->created_at,
        ];
    }
}
