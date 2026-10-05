<?php

namespace App\Http\Resources;

use App\Models\JingleList;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One jingle list and its rule, as the Jingles page edits it. Times trimmed
 * to HH:MM.
 *
 * @mixin JingleList
 */
class JingleListResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'enabled' => $this->enabled,
            'pick' => $this->pick,
            'pinned_track_id' => $this->pinned_track_id,
            'frequency' => $this->frequency,
            'every_minutes' => $this->every_minutes,
            'every_songs' => $this->every_songs,
            'times' => $this->times ?? [],
            'exact' => $this->exact,
            'days' => $this->days === null ? null : array_map('intval', $this->days),
            'from_time' => $this->from_time === null ? null : substr($this->from_time, 0, 5),
            'to_time' => $this->to_time === null ? null : substr($this->to_time, 0, 5),
            'position' => $this->position,
            'last_played_at' => $this->last_played_at,
        ];
    }
}
