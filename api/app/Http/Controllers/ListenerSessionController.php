<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\ListenerAnalytics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The listener side of analytics: hand out a token, take check-ins, take a
 * goodbye. Three endpoints, all public and unauthenticated, because a listener
 * is anonymous by definition.
 *
 * None of this is in the audio path. The stream URL returned here points
 * straight at nginx, exactly as it did before — if this controller returns 500
 * for an hour, every station keeps playing and the only thing lost is an hour
 * of statistics. That is the trade this design exists to make.
 *
 * @see ListenerAnalytics for why counting works this way at all.
 */
class ListenerSessionController extends Controller
{
    /**
     * Open a session. Called once, when the listener presses play.
     *
     * The response carries the check-in interval rather than letting the
     * client pick one, so the cadence — and its relationship to
     * `live_window_seconds`, which is what makes the live count correct — stays
     * a server-side decision that can be changed without shipping a frontend.
     */
    public function store(string $slug, Request $request, ListenerAnalytics $analytics): JsonResponse
    {
        $station = Station::where('slug', $slug)->firstOrFail();

        // The player names the transport it actually used, because only it
        // knows: it may have been handed an HLS URL and still fallen back to
        // the Icecast mount. That distinction decides whether this listener is
        // ADDED to the live count or merely recorded, since an Icecast
        // listener is already inside the number the admin poll returns.
        // Unrecognised values fall back to the configured default rather than
        // erroring — a listener must never lose audio over a bad enum.
        $validated = $request->validate([
            'transport' => ['sometimes', 'string', Rule::in(ListenerAnalytics::TRANSPORTS)],
        ]);

        $session = $analytics->start($station, $request, $validated['transport'] ?? null);

        return response()->json(['data' => [
            'token' => $session->id,
            'beat_every' => (int) config('analytics.beat_interval_seconds', 15),
        ]], 201);
    }

    /**
     * "Still listening." Costs one Redis read and one Redis write; deliberately
     * touches no table.
     *
     * An unknown token is a 404 rather than a silent 204 so the player can tell
     * the difference between "you are being counted" and "your session expired
     * while the laptop was asleep, start a new one".
     */
    public function beat(string $token, ListenerAnalytics $analytics): JsonResponse
    {
        if (! $analytics->beat($token)) {
            return response()->json(['message' => 'Unknown listener session.'], 404);
        }

        return response()->json(null, 204);
    }

    /**
     * "I'm gone." Sent by the player's unload beacon.
     *
     * Always 204, even for a token that was already closed: this arrives via
     * `navigator.sendBeacon` from a page that is being destroyed, so nothing
     * can read the response or retry, and a duplicate is far more likely than
     * a caller who needs to know it failed.
     */
    public function end(string $token, ListenerAnalytics $analytics): JsonResponse
    {
        $analytics->end($token);

        return response()->json(null, 204);
    }
}
