<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

/**
 * Called by the relay when a broadcast ends (after silence timeout).
 *
 * Closes any open stream sessions, marks the station as offline,
 * and clears Redis metadata so stale now-playing info is not served.
 */
class StreamEndedController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'station_id' => ['required', 'string'],
        ]);

        $station = Station::findOrFail($request->station_id);

        $station->streamSessions()->whereNull('ended_at')->update(['ended_at' => now()]);
        $station->update(['is_live' => false]);

        Redis::del("metadata:{$station->id}");

        return response()->json(['message' => 'Stream ended.']);
    }
}
