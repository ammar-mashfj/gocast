<?php

namespace App\Http\Resources;

use App\Models\Playlist;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Playlist
 *
 * `track_count` and `duration_seconds` appear only when the query asked for
 * them (`withCount('tracks')`, `withSum('tracks', 'duration_seconds')`) —
 * the list endpoint does, so the rail can show "42 tracks · 2h 51m" without
 * loading a single member row.
 */
class PlaylistResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'station_id' => $this->station_id,
            'name' => $this->name,
            'is_default' => $this->is_default,
            'order' => $this->order,
            'position' => $this->position,
            'track_count' => $this->whenCounted('tracks'),
            'duration_seconds' => $this->whenAggregated('tracks', 'duration_seconds', 'sum', fn ($value) => (float) ($value ?? 0)),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
