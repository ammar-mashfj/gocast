<?php

namespace App\Http\Resources;

use App\Models\Track;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Track
 *
 * `position` is context-dependent, deliberately: rendered from a playlist
 * endpoint (the pivot is loaded) it is the track's position IN THAT
 * PLAYLIST, which is the number the drag handles there act on; rendered from
 * the library it is `tracks.position`, the library order. One key, because a
 * list is only ever one of the two and the client sorts on it either way.
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
            'position' => $this->whenPivotLoaded('playlist_track', fn () => (int) $this->pivot->position, $this->position),
            'playlist_ids' => $this->whenLoaded('playlists', fn () => $this->playlists->pluck('id')->values()),
            'original_filename' => $this->original_filename,
            'created_at' => $this->created_at,
        ];
    }
}
