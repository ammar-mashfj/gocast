<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StreamSession;
use App\Services\BroadcastStateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Internal relay endpoint for live broadcast heartbeats.
 *
 * The relay owns the real transport state; Laravel stores that state in the
 * cache so public pages and start guards do not trust stale DB flags.
 */
class BroadcastStateController extends Controller
{
    public function __invoke(Request $request, BroadcastStateService $broadcastState): JsonResponse
    {
        $validated = $request->validate([
            'station_id' => ['required', 'uuid'],
            'session_id' => ['required', 'uuid'],
            'device_id' => ['required', 'string', 'max:128'],
            'connection_id' => ['required', 'string', 'max:128'],
            'status' => ['required', Rule::in(['live', 'reconnecting'])],
        ]);

        $station = Station::findOrFail($validated['station_id']);
        $session = StreamSession::whereKey($validated['session_id'])
            ->where('station_id', $station->id)
            ->whereNull('ended_at')
            ->first();

        if (! $session) {
            $broadcastState->forget($station);

            return response()->json([
                'code' => 'broadcast_session_missing',
                'message' => 'Broadcast session is no longer active.',
            ], 409);
        }

        $state = $validated['status'] === 'live'
            ? $broadcastState->markLive($station, $session, $validated['device_id'], $validated['connection_id'])
            : $broadcastState->markReconnecting($station, $session, $validated['device_id'], $validated['connection_id']);

        if ($validated['status'] === 'live' && ! $station->is_live) {
            $station->update(['is_live' => true]);
        }

        return response()->json(['data' => $state]);
    }
}
