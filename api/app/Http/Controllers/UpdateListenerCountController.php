<?php

namespace App\Http\Controllers;

use App\Models\StreamSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

/**
 * Called by the relay to update real-time listener count in Redis and track peak listeners.
 */
class UpdateListenerCountController extends Controller
{
    /**
     * Store the current listener count in Redis and update the session's
     * peak_listeners watermark if the new count exceeds the previous peak.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'station_id' => ['required', 'string'],
            'count' => ['required', 'integer', 'min:0'],
        ]);

        Redis::set("listeners:{$request->station_id}", $request->count);

        if ($request->count > 0) {
            StreamSession::where('station_id', $request->station_id)
                ->whereNull('ended_at')
                ->where('peak_listeners', '<', $request->count)
                ->update(['peak_listeners' => $request->count]);
        }

        return response()->json(['message' => 'Listener count updated.']);
    }
}
