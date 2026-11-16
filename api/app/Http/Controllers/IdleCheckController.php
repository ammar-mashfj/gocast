<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StationEvent;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Records what the studio's idle check did on a Free live show.
 *
 * The check runs entirely in the browser (client/components/studio/
 * IdleShowGuard.tsx): an hour with nobody touching the dashboard asks the
 * host whether they are still there, and ten minutes without an answer ends
 * the show through the ordinary End show path (`ended`). The host can also
 * stay (`kept`) or end the show from the question themselves (`ended_by_host`). Nothing on the server knows the
 * difference between that and a host pressing End show, so these rows are the
 * only trace of how often Free shows are left running unattended.
 *
 * Admin monitoring only, like every StationEvent.
 */
class IdleCheckController extends Controller
{
    use AuthorizesRequests;

    /** @var list<string> */
    private const FIELDS = ['outcome', 'on_air_seconds', 'hidden'];

    public function __invoke(Request $request, Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        $validated = $request->validate([
            'outcome' => ['required', 'string', 'in:kept,ended,ended_by_host'],
            'on_air_seconds' => ['nullable', 'integer', 'min:0'],
            'hidden' => ['nullable', 'boolean'],
        ]);

        StationEvent::record(
            $station,
            StationEvent::TYPE_IDLE_CHECK,
            StationEvent::SOURCE_OWNER,
            array_filter(
                array_intersect_key($validated, array_flip(self::FIELDS)),
                fn ($value) => $value !== null,
            ),
            $request->user(),
        );

        return response()->json(['recorded' => true]);
    }
}
