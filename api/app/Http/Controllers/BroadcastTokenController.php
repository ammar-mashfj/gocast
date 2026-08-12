<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Issues a short-lived, station-scoped broadcaster token. The SPA calls this
 * just before opening a WHIP connection; the returned token is appended to
 * the WHIP URL's ?token=... so MediaMtxAuthController can authenticate the
 * publisher without the long-lived Sanctum bearer ever leaving Laravel.
 *
 * Token properties (see BroadcastTokenService):
 *   • bound to {user, station} — usable for one station only
 *   • TTL ~60s — just enough for the WHIP handshake
 *   • stateless — HMAC-signed with APP_KEY; no DB hit on verify
 *
 * Caller must own the station; otherwise we 403 with an unambiguous message
 * so the studio UI can show "this isn't your station" instead of a generic
 * auth error.
 */
class BroadcastTokenController extends Controller
{
    public function __invoke(Request $request, BroadcastTokenService $tokens): JsonResponse
    {
        $data = $request->validate([
            'station_slug' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $station = Station::where('slug', $data['station_slug'])->first();
        if ($station === null || $station->user_id !== $user->id) {
            return response()->json(['message' => 'You do not own this station.'], 403);
        }

        return response()->json([
            'token' => $tokens->issue($user, $station),
            'expires_in' => BroadcastTokenService::TTL_SECONDS,
        ]);
    }
}
