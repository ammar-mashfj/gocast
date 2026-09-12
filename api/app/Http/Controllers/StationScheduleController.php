<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReplaceStationSchedulesRequest;
use App\Http\Resources\StationResource;
use App\Models\Station;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The owner's advertised show times.
 *
 * One verb, because the resource is a short ordered list rather than a set of
 * independently addressable things — see ReplaceStationSchedulesRequest.
 */
class StationScheduleController extends Controller
{
    use AuthorizesRequests;

    public function replace(ReplaceStationSchedulesRequest $request, Station $station): StationResource
    {
        $this->authorize('update', $station);

        $data = $request->validated();
        $rows = $data['schedules'];
        $timezone = array_key_exists('timezone', $data) ? $data['timezone'] : $station->timezone;

        // A wall clock with no zone is not a time. Storing "20:00" against a
        // station whose timezone is null would publish a number that means
        // something different to every reader, so the write is refused rather
        // than guessed at — UTC is not a safe default for a claim a human
        // made about their own evening.
        if ($rows !== [] && $timezone === null) {
            throw ValidationException::withMessages([
                'timezone' => 'Set the station timezone before adding show times.',
            ]);
        }

        DB::transaction(function () use ($station, $rows, $timezone) {
            // Same transaction as the rows below, so the zone can never end
            // up applied to times that were not saved with it.
            if ($timezone !== $station->timezone) {
                $station->forceFill(['timezone' => $timezone])->save();
            }

            // Delete-and-recreate, not a diff. The rows carry no identity
            // worth preserving — nothing references them, they have no
            // history, and the ULIDs are never shown — so a diff would be
            // machinery in exchange for nothing.
            $station->schedules()->delete();

            foreach ($rows as $position => $row) {
                $station->schedules()->create([
                    'label' => $row['label'] ?? null,
                    // Re-index and sort so the stored array is canonical,
                    // whatever order the checkboxes were clicked in.
                    'days' => collect($row['days'])->map(fn ($day) => (int) $day)->sort()->values()->all(),
                    'start_time' => $row['start_time'],
                    'position' => $position,
                ]);
            }
        });

        return new StationResource($station->load('schedules'));
    }
}
