<?php

namespace App\Http\Controllers;

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use App\Models\StreamSession;
use App\Services\BroadcastStateService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

    public function store(Request $request, Station $station, BroadcastStateService $broadcastState): JsonResponse
    {
        $this->authorize('update', $station);

        $validated = $request->validate([
            'device_id' => ['required', 'string', 'max:128'],
            'source_type' => ['sometimes', Rule::in(['browser', 'electron', 'external'])],
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

        $wasLive = $station->is_live;

        $station->streamSessions()->whereNull('ended_at')->update(['ended_at' => now()]);

        $session = $station->streamSessions()->create([
            'started_at' => now(),
            'source_type' => $validated['source_type'] ?? 'browser',
        ]);

        $broadcastState->markStarting($station, $session, $deviceId);
        $station->update(['is_live' => true]);

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
        $station->update(['is_live' => false]);
        Redis::del("metadata:{$station->id}");

        return response()->json([
            'data' => $session,
            'message' => 'Stream ended.',
        ]);
    }
}
