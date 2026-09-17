<?php

namespace App\Http\Controllers;

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use App\Models\StreamSession;
use App\Services\BroadcastStateService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Illuminate\Validation\Rule;

/**
 * Manages broadcast sessions -- tracks when a station goes live and ends.
 */
class StreamSessionController extends Controller
{
    use AuthorizesRequests;

    public function index(Station $station): JsonResponse
    {
        $this->authorize('view', $station);

        return response()->json(
            $station->streamSessions()->latest('started_at')->paginate(20)
        );
    }

    /**
     * Open a broadcast session from a CLIENT.
     *
     * ⚠ NOTHING IN THIS REPOSITORY CALLS THIS TODAY, and the guards below read
     * as though something does. Worth knowing before trusting one of them to
     * be protecting a live path:
     *
     *   • The web studio does not. It opens no session of its own — harbor's
     *     `live_connected` event does it (client/lib/broadcast.ts,
     *     getSessionId: "No app-side session id under webcast").
     *   • An encoder does not, and must not: `source_type` below refuses
     *     'external' for that reason.
     *   • The desktop client would, which is what `electron` is reserved for
     *     and why the guards are written the way they are — but there is no
     *     desktop client in this repo yet. `electron` appears only in a type
     *     union and the sessions migration.
     *
     * So this is the shape the next client has to meet rather than a path
     * anything travels now. It is kept working, and covered by tests that
     * exercise it directly, because the alternative is discovering the encoder
     * interactions below the first week a desktop build ships. Do not read a
     * guard here as evidence that the case it describes is reachable.
     */
    public function store(Request $request, Station $station, BroadcastStateService $broadcastState): JsonResponse
    {
        $this->authorize('update', $station);

        $validated = $request->validate([
            'device_id' => ['required', 'string', 'max:128'],
            // 'external' is deliberately NOT accepted here. An encoder
            // session is opened by harbor's `live_connected` event, never by a
            // client — and letting one be POSTed meant an owner could create a
            // row that refuses every subsequent studio start below AND blocks
            // the stop button, with nothing on air to explain either.
            'source_type' => ['sometimes', Rule::in(['browser', 'electron'])],
        ]);

        $deviceId = $validated['device_id'];
        $active = $broadcastState->activeForStation($station);

        if ($active && ! $broadcastState->sameDevice($active, $deviceId)) {
            return response()->json([
                'code' => 'station_already_live',
                'message' => 'This station is already live from another device.',
                'data' => [
                    'status' => $active['status'] ?? 'live',
                    'started_at' => $active['started_at'] ?? null,
                ],
            ], 409);
        }

        if ($active && $broadcastState->sameDevice($active, $deviceId)) {
            $session = $station->streamSessions()
                ->whereKey($active['session_id'] ?? null)
                ->whereNull('ended_at')
                ->first();

            if ($session) {
                return response()->json([
                    'data' => $session,
                    'message' => 'Stream session already active.',
                ]);
            }

            $broadcastState->forget($station);
        }

        // An EXTERNAL ENCODER is holding the mount.
        //
        // This has to be its own refusal, before the straggler sweep below,
        // because that sweep would close the encoder's open session — ending a
        // broadcast that is still very much on air, as far as the row is
        // concerned — and the studio would then fail anyway when harbor
        // refused the second source. The result was a truncated airtime record
        // plus "could not reach the stream server".
        //
        // The device check above cannot catch this. It reads BroadcastState in
        // Redis, which only the studio writes; an encoder's presence exists
        // solely as the session row harbor's `live_connected` opened.
        //
        // WHO THIS IS FOR: a desktop client, once there is one — not the web
        // studio, and not today. See the method docblock; nothing calls this
        // yet, so the paragraph below is about a client that will exist rather
        // than one that does.
        //
        // The web studio opens no session of its own — harbor's connect
        // callback does it (client/lib/broadcast.ts, getSessionId) — so it
        // meets the encoder at the socket instead, where harbor refuses the
        // second source. A studio user therefore never sees this refusal; they
        // see the go-live page's "already live" view, which reads the same
        // facts from GET /status. This guard exists so that a desktop client
        // gets a readable answer rather than a failed socket.
        //
        // `latest('started_at')` matches the two other places that ask this
        // same question — StationStatusController::liveSource() and
        // StationLifecycleService::stop(). openSession() should mean there is
        // never more than one open row, so the ordering decides nothing today;
        // it is here so that if that invariant ever slips, all three answer
        // about the SAME broadcast rather than each picking arbitrarily. Three
        // agreeing answers are debuggable; three disagreeing ones are not.
        $encoder = $station->streamSessions()
            ->whereNull('ended_at')
            ->where('source_type', 'external')
            ->latest('started_at')
            ->first();

        // ...unless that session is a GHOST.
        //
        // The row is opened by `live_connected` and closed by
        // `live_disconnected`, and the close can be lost: an OOM-killed
        // container never sends it, nor does one on the wrong side of a
        // network partition. The row then says "live from an encoder" forever
        // while nothing is publishing, and the refusal above locks the owner
        // out of their own studio until ReconcileStations burns through its
        // strikes — if it ever does.
        //
        // A stopped station is the unambiguous case: no container, so no
        // harbor, so nothing can be connected to it whatever the row claims.
        // Fall through and let the sweep below close it.
        $ghostId = null;

        if ($encoder !== null && ! $station->isRunning()) {
            Log::info('Clearing a ghost encoder session for a stopped station', [
                'station' => $station->slug,
                'session' => $encoder->id,
                'started_at' => optional($encoder->started_at)->toIso8601String(),
            ]);

            // Remembered, not just discarded, because $wasLive below has to
            // know this row is not a broadcast. See there.
            $ghostId = $encoder->id;
            $encoder = null;
        }

        if ($encoder !== null) {
            return response()->json([
                'code' => 'station_already_live',
                'message' => $encoder->client
                    ? "This station is already live from {$encoder->client}. Disconnect it there before broadcasting from the studio."
                    : 'This station is already live from an external encoder. Disconnect it there before broadcasting from the studio.',
                'data' => [
                    'status' => 'live',
                    'started_at' => $encoder->started_at,
                    'source_type' => $encoder->source_type,
                ],
            ], 409);
        }

        // Whether a broadcast was already in flight, read before we close any
        // stragglers below — the open session IS the live signal, so this has
        // to be sampled first or it always reads false.
        //
        // The ghost is excluded, and it has to be. `isLive()` is "any open
        // session", so a ghost left behind by an OOM-killed encoder container
        // reads as a broadcast already in flight — and the studio start that
        // follows it would then dispatch no notification, because the station
        // was apparently live already. Nobody was on air, so nobody was told
        // when someone finally was, and the one broadcast that most needs an
        // audience is the one after a crash.
        $wasLive = $station->streamSessions()
            ->whereNull('ended_at')
            ->when($ghostId !== null, fn ($query) => $query->whereKeyNot($ghostId))
            ->exists();

        $station->streamSessions()->whereNull('ended_at')->update(['ended_at' => now()]);

        $session = $station->streamSessions()->create([
            'started_at' => now(),
            'source_type' => $validated['source_type'] ?? 'browser',
        ]);

        $broadcastState->markStarting($station, $session, $deviceId);

        if (! $wasLive) {
            SendStationLiveNotifications::dispatch($station->id, $session->id)
                ->delay(now()->addMinutes(2));
        }

        return response()->json([
            'data' => $session,
            'message' => 'Stream started.',
        ], 201);
    }

    public function destroy(Station $station, StreamSession $session, BroadcastStateService $broadcastState): JsonResponse
    {
        $this->authorize('update', $station);

        $broadcastState->forget($station);
        $session->update(['ended_at' => now()]);
        Redis::del("metadata:{$station->id}");

        return response()->json([
            'data' => $session,
            'message' => 'Stream ended.',
        ]);
    }
}
