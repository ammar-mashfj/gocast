<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastTokenService;
use App\Services\TurnCredentialService;
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
 *
 * Also returns the ICE server list (STUN + short-lived TURN credentials). It
 * rides along here because the SPA calls this immediately before creating its
 * RTCPeerConnection, so the credentials are as fresh as they can be and no
 * extra round trip is needed. See TurnCredentialService for why TURN matters.
 */
class BroadcastTokenController extends Controller
{
    public function __invoke(
        Request $request,
        BroadcastTokenService $tokens,
        TurnCredentialService $turn,
    ): JsonResponse {
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
            // Issued here rather than configured in the client so the TURN key
            // never reaches a browser, and so the credentials are short-lived.
            // The SPA is already calling this endpoint immediately before it
            // builds the RTCPeerConnection, so this costs no extra round trip.
            'ice_servers' => $turn->iceServers(),
        ]);
    }
}
