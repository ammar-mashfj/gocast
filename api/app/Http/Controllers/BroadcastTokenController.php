<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastOrigin;
use App\Services\BroadcastTokenService;
use App\Services\IcecastAdmin;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

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
 * Also returns the webcast WebSocket URL to publish to — this station's
 * harbor input, or the shared relay for a station on the relay path. It
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
        BroadcastOrigin $origin,
        IcecastAdmin $icecast,
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

        // Admin monitoring: the IP and country shown on /admin/stations. This
        // request is the last one from the broadcaster's own device before
        // harbor connects, so it is the only place the real address exists.
        $origin->remember($station, $request);

        if ($station->usesRelay()) {
            $this->releaseStaleRelaySource($station, $icecast);
        }

        return response()->json([
            'token' => $tokens->issue($user, $station),
            'expires_in' => BroadcastTokenService::TTL_SECONDS,
            // Where to publish. Resolved server-side because in local dev it
            // is the container's current bridge IP, which changes on every
            // restart — the client must not cache or guess it.
            'ingest_url' => $station->usesRelay()
                ? (string) config('relay.ingest_url')
                : $supervisor->ingestUrl($station),
            // Which protocol the studio speaks at that address. `relay`
            // answers the hello with {"type":"ok"} once Icecast has admitted
            // the source, and carries no metadata — the studio sends the
            // title to /stations/{slug}/now-playing instead. Decided here,
            // from the path the station started on, so the client never
            // guesses it.
            'ingest' => $station->usesRelay() ? Station::INGEST_RELAY : Station::INGEST_CONTAINER,
        ]);
    }

    /**
     * Free the station's Icecast mount for the connection this token is for.
     *
     * The studio asks for a token right before every connect and reconnect.
     * A source Icecast still carries at that moment is almost always the same
     * studio's previous connection, which died without a close (a phone
     * switching networks, a backgrounded tab): the relay only lets go of it
     * after its idle timeout, and until then Icecast answers the reconnect
     * "Mountpoint in use" — ten to fifteen seconds of silence on air, measured
     * locally, against about one with this.
     *
     * Newest wins: a second device pressing Go Live takes the station over
     * from the first. Only the owner can get here, and the listeners are not
     * disconnected — Icecast moves them to /standby and back, exactly as when
     * the idle timeout fires. The session close and rejoin that follow are the
     * same callbacks a relay blip already produces.
     *
     * Only on the relay path. A container's source is Liquidsoap, which plays
     * AutoDJ between shows and must never be cut from here.
     */
    private function releaseStaleRelaySource(Station $station, IcecastAdmin $icecast): void
    {
        if ($icecast->carries($station->icecast_mount) !== true) {
            return;
        }

        $released = $icecast->killSource($station);

        Log::info('Released a relay source for a reconnecting studio', [
            'station' => $station->slug,
            'released' => $released,
        ]);
    }
}
