<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API resource for station data.
 *
 * Includes computed stats (total sessions, cumulative airtime, peak listeners)
 * only when the streamSessions relation is eager-loaded, keeping list responses lean.
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
            'stats' => $this->whenLoaded('streamSessions', function () {
                $sessions = $this->streamSessions->whereNotNull('ended_at');

                $totalAirtimeSeconds = $sessions->sum(fn ($s) => $s->started_at->diffInSeconds($s->ended_at));

                return [
                    'sessions' => $sessions->count(),
                    'total_airtime_seconds' => $totalAirtimeSeconds,
                    'peak_listeners' => $sessions->max('peak_listeners') ?? 0,
                ];
            }),
        ];
    }
}
