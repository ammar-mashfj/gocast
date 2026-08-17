<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastTokenService;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Issues a short-lived, station-scoped broadcaster token. The SPA calls this
 * just before opening the webcast WebSocket; the token is sent as the password
 * in the hello frame, and harbor's auth callback posts it to Laravel so the
 * publisher is authenticated without the long-lived Sanctum bearer ever
 * leaving the server.
 *
 * Token properties (see BroadcastTokenService):
 *   • bound to {user, station} — usable for one station only
 *   • TTL ~60s — just enough to open the socket
 *   • stateless — HMAC-signed with APP_KEY; no DB hit on verify
 *
 * Caller must own the station; otherwise we 403 with an unambiguous message
 * so the studio UI can show "this isn't your station" instead of a generic
 * auth error.
 *
 * Also returns the webcast WebSocket URL for this station's harbor input. It
 * rides along here because the SPA calls this immediately before opening the
 * socket, and in local dev the address is a container IP that changes on every
 * restart — so it has to be resolved per request, not configured.
 */
class BroadcastTokenController extends Controller
{
    public function __invoke(
        Request $request,
        BroadcastTokenService $tokens,
        LiquidsoapSupervisor $supervisor,
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
            // Where to publish. Resolved server-side because in local dev it
            // is the container's current bridge IP, which changes on every
            // restart — the client must not cache or guess it.
            'ingest_url' => $supervisor->ingestUrl($station),
        ]);
    }
}
