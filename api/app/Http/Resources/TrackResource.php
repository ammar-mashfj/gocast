<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

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
            'title' => $this->title,
            'artist' => $this->artist,
            'duration' => $this->duration,
            'file_size' => $this->file_size,
            'sort_order' => $this->sort_order,
            'created_at' => $this->created_at,
        ];
    }
}
