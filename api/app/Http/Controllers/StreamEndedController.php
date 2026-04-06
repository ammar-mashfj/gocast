<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

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
