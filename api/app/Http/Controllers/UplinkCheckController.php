<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StationEvent;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Records what the studio's go-live connection check decided.
 *
 * The check runs in the browser (client/lib/uplinkProbe.ts, timing uploads to
 * UplinkProbeController) and either picks a bitrate or refuses to go live.
 * A refusal otherwise leaves no trace anywhere: no container starts, no
 * session opens. These rows are how anyone can tell how often people are
 * turned away, and on what lines, before moving the thresholds.
 *
 * Admin monitoring only, like every StationEvent.
 */
class UplinkCheckController extends Controller
{
    use AuthorizesRequests;

    /** @var list<string> */
    private const FIELDS = [
        'outcome', 'kbps', 'bitrate', 'net_type', 'net_effective', 'net_downlink', 'net_rtt',
    ];

    public function __invoke(Request $request, Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        $validated = $request->validate([
            'outcome' => ['required', 'string', 'in:ok,lowered,blocked,failed'],
            'kbps' => ['nullable', 'integer', 'min:0'],
            'bitrate' => ['nullable', 'integer', 'min:0', 'max:320'],
            'net_type' => ['nullable', 'string', 'max:16'],
            'net_effective' => ['nullable', 'string', 'max:8'],
            'net_downlink' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'net_rtt' => ['nullable', 'integer', 'min:0'],
        ]);

        StationEvent::record(
            $station,
            StationEvent::TYPE_UPLINK_CHECK,
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
