<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastStateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Redis;

/**
 * Called by the relay on startup to mark all stations as offline and clean up stale sessions.
 *
 * When the relay restarts, any previously-live stations are orphaned.
 * This endpoint closes their open sessions and clears Redis metadata
 * so the system reflects the actual relay state.
 */
class ResetLiveStationsController extends Controller
{
    public function __invoke(BroadcastStateService $broadcastState): JsonResponse
    {
        $stations = Station::where('is_live', true)->get();

        foreach ($stations as $station) {
            $broadcastState->forget($station);
            $station->streamSessions()->whereNull('ended_at')->update(['ended_at' => now()]);
            $station->update(['is_live' => false]);
            Redis::del("metadata:{$station->id}");
            Redis::del("listeners:{$station->id}");
        }

        return response()->json([
            'message' => 'All live stations reset.',
            'count' => $stations->count(),
        ]);
    }
}
