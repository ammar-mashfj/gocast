<?php

namespace App\Http\Resources;

use App\Models\AutodjSlot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One programming slot, as the editor round-trips it. Times trimmed to
 * HH:MM — the seconds a TIME column carries are noise here.
 *
 * @mixin AutodjSlot
 */
class AutodjSlotResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'playlist_id' => $this->playlist_id,
            'label' => $this->label,
            'days' => array_map('intval', $this->days),
            'start_time' => substr($this->start_time, 0, 5),
            'end_time' => substr($this->end_time, 0, 5),
            'position' => $this->position,
        ];
    }
}
