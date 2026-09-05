<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\AudienceReport;
use App\Services\ListenerAnalytics;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The station owner's view of their own audience.
 *
 * NOT A 403 WHEN THE PLAN DOES NOT INCLUDE IT. A locked account still gets a
 * 200 carrying the two figures it is entitled to — listeners right now and the
 * all-time peak — plus `locked: true` and an empty window. The screen is an
 * upsell as much as a report, and it has to render the real live number beside
 * the locked sections to be worth showing at all; a 403 would force the client
 * to decide who is entitled to what, which is precisely the decision that must
 * stay on this side of the wire.
 *
 * Entitlement is therefore expressed by WHAT IS IN THE PAYLOAD, not by the
 * status code. Nothing a free account may not see is ever serialised, so the
 * gate cannot be lifted by editing the response in a browser.
 *
 * @see AudienceReport for why each figure comes from the table it comes from.
 * @see ListenerAnalytics for how any of it is counted in the first place.
 */
class AudienceController extends Controller
{
    use AuthorizesRequests;

    /**
     * Windows the UI offers. A fixed list rather than a free integer so the
     * range control and the server cannot drift, and so a crafted `?days=3650`
     * can't turn a cheap grouped scan into a table sweep.
     */
    public const WINDOWS = [7, 30, 90];

    public function __invoke(Request $request, Station $station, AudienceReport $report, ListenerAnalytics $analytics): JsonResponse
    {
        $this->authorize('view', $station);

        // A user with no plan row is free everywhere else (see
        // StationLifecycleService::autoDjEnabled) and must be free here too,
        // or the UI and the payload would disagree about a locked account.
        $planDays = (int) ($request->user()->plan?->analytics_days ?? 0);

        if ($planDays <= 0) {
            return response()->json(['data' => [
                'locked' => true,
                'plan_days' => 0,
                'range_days' => 0,
                // Both are live, both are already on the station page, and
                // both stay free: the point of the locked screen is to show a
                // real number next to the ones that are missing.
                'live' => $analytics->liveCount($station),
                'peak_all_time' => (int) $station->listenerStats()->max('peak_listeners'),
            ]]);
        }

        $planDays = $report->clampWindow($planDays);

        $requested = (int) $request->integer('days', $planDays);

        // Silently narrowed rather than rejected. The range control is shared
        // by every plan, so a tier with a shorter window would otherwise get a
        // validation error from a button that looks perfectly available.
        $days = in_array($requested, self::WINDOWS, true) ? min($requested, $planDays) : $planDays;

        return response()->json([
            'data' => array_merge(
                ['locked' => false, 'plan_days' => $planDays],
                $report->build($station, $days),
            ),
        ]);
    }
}
