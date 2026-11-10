<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastOrigin;
use App\Services\BroadcastTokenService;
use App\Services\IcecastAdmin;
use App\Services\LiquidsoapSupervisor;
use App\Services\RelaySourceHolder;
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
        RelaySourceHolder $holder,
    ): JsonResponse {
        $data = $request->validate([
            'station_slug' => ['required', 'string', 'max:255'],
            // Random, made up by the studio once per go-live and sent on every
            // reconnect of that show: see RelaySourceHolder.
            'studio' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Za-z0-9-]{8,64}$/'],
        ]);
        $studio = $data['studio'] ?? null;

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
        $origin->remember($station, $request, $studio);

        $heldSource = $studio !== null && $station->usesRelay() ? $holder->heldSource($station, $studio) : null;

        if ($heldSource !== null) {
            $this->releaseOwnDeadSource($station, $icecast, $heldSource);
        }

        return response()->json([
            'token' => $tokens->issue($user, $station, studio: $studio),
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
     * Cut the source this same studio left behind.
     *
     * The studio asks for a token right before every connect and reconnect.
     * When the source Icecast holds for this station is this studio's own
     * (RelaySourceHolder), it is a connection that died without a close — a
     * phone switching networks, a backgrounded tab — and the relay would hold
     * it until its idle timeout, answering the reconnect "Mountpoint in use"
     * meanwhile. Cutting it brings the show back in about a second instead.
     *
     * Only the same studio: a second device or a stale tab has another id,
     * cuts nothing, and is told "already live". The listeners stay connected
     * either way — Icecast moves them to /standby and back.
     *
     * And only that studio's own source. Icecast cuts whatever is on the
     * mount, and our record of the holder can be behind it: this studio's
     * source may have timed out and another device's taken the mount before
     * its connect event was processed. So Icecast is asked first which source
     * is on the mount, and anything but the one this studio holds — another
     * source, none, or no answer — is left alone. The reconnect then waits
     * for the relay's idle timeout, as it did before the cut existed.
     */
    private function releaseOwnDeadSource(Station $station, IcecastAdmin $icecast, string $heldSource): void
    {
        $onMount = $icecast->sourceInstance($station->icecast_mount);

        if ($onMount !== $heldSource) {
            Log::info('Left a relay mount alone: its source is not the reconnecting studio\'s', [
                'station' => $station->slug,
                'held' => $heldSource,
                'on_mount' => $onMount,
            ]);

            return;
        }

        $released = $icecast->killSource($station);

        Log::info('Released a relay source for its reconnecting studio', [
            'station' => $station->slug,
            'released' => $released,
        ]);
    }
}
