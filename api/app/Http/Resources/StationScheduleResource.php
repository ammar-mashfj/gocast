<?php

namespace App\Http\Resources;

use App\Models\StationSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One advertised show time, plus the instant it next happens.
 *
 * `next_occurrence` is the only computed field and the reason this resource
 * exists at all: the browser has the wall clock and the zone name but no way
 * to combine them correctly across a DST boundary without a date library the
 * client does not carry. Shipping a UTC instant reduces the client's job to
 * formatting, which Intl does properly in every locale.
 *
 * Null when the station has no timezone — an unanchored wall clock names no
 * instant. The write path refuses to create rows in that state, so it should
 * only be reachable for a station whose zone was cleared after the fact.
 *
 * @mixin StationSchedule
 */
class StationScheduleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'days' => array_map('intval', $this->days),
            // Trimmed to HH:MM. The seconds a TIME column carries are noise
            // here — nobody schedules a show at 20:00:30 — and sending them
            // would only give the client something to strip.
            'start_time' => substr($this->start_time, 0, 5),
            'next_occurrence' => $this->nextOccurrence()?->utc()->toIso8601String(),
        ];
    }
}
