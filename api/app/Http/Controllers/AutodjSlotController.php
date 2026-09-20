<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReplaceAutodjSlotsRequest;
use App\Http\Resources\StationResource;
use App\Models\Station;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Support\Facades\DB;

/**
 * The owner's AutoDJ programme: which playlist plays when.
 *
 * One verb, a full-list PUT, exactly like the show times — and, exactly like
 * them, its own controller. Nothing here restarts a container: slots are
 * read per track boundary by AutoDjProgramme, never rendered into the .liq.
 */
class AutodjSlotController extends Controller
{
    use AuthorizesRequests;

    public function replace(ReplaceAutodjSlotsRequest $request, Station $station): StationResource
    {
        $this->authorize('update', $station);

        $data = $request->validated();
        $rows = $data['slots'];
        $timezone = array_key_exists('timezone', $data) ? $data['timezone'] : $station->timezone;

        DB::transaction(function () use ($station, $rows, $timezone) {
            // Same transaction as the rows, so the zone can never end up
            // applied to windows that were not saved with it. `timezone` is
            // not one of StationObserver's restart columns.
            if ($timezone !== $station->timezone) {
                $station->forceFill(['timezone' => $timezone])->save();
            }

            // Delete-and-recreate: the rows carry no identity worth keeping.
            $station->autodjSlots()->delete();

            foreach ($rows as $position => $row) {
                $station->autodjSlots()->create([
                    'playlist_id' => $row['playlist_id'],
                    'label' => $row['label'] ?? null,
                    'days' => collect($row['days'])->map(fn ($day) => (int) $day)->unique()->sort()->values()->all(),
                    'start_time' => $row['start_time'],
                    'end_time' => $row['end_time'],
                    'position' => $position,
                ]);
            }
        });

        // Fresh relations: the resource composes `programme` from them.
        $station->unsetRelation('autodjSlots')->unsetRelation('defaultPlaylist');

        return new StationResource($station->load(['autodjSlots.playlist', 'defaultPlaylist']));
    }
}
