<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API resource for station data.
 *
 * Includes computed stats (total sessions, cumulative airtime, peak listeners)
 * when the stats attribute is set on the model.
 */
class StationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'genre' => $this->genre,
            'artwork_url' => $this->artwork_url,
            'is_live' => $this->is_live,
            'icecast_mount' => $this->icecast_mount,
            'social_links' => $this->social_links,
            'theme_config' => $this->theme_config,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'stats' => $this->stats ?? null,
        ];
    }
}
