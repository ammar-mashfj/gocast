<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastStateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Redis;

/**
 * Public endpoint returning real-time listener count and now-playing info for a station.
 */
class ListenerCountController extends Controller
{
    public function show(string $slug, BroadcastStateService $broadcastState): JsonResponse
    {
        $station = Station::where('slug', $slug)->firstOrFail();

        // Written by the `stations:sync-listeners` scheduled command, which
        // polls Icecast's admin API every minute. Absent key (TTL expired, or
        // the scheduler is down) reads as 0.
        $count = (int) Redis::get("listeners:{$station->id}") ?: 0;
        $metadata = json_decode(Redis::get("metadata:{$station->id}") ?: '{}', true);

        $isLive = $broadcastState->isLive($station) || (bool) $station->is_live;
        $hasMetadata = is_array($metadata) && (! empty($metadata['title']) || ! empty($metadata['artist']));

        return response()->json(['data' => [
            'count' => $count,
            'is_live' => $isLive,
            // is_on_air mirrors StationResource: true for live broadcasters
            // AND for AutoDJ rotations (the metadata key proves Liquidsoap
            // is producing audio).
            'is_on_air' => $isLive || $hasMetadata,
            'now_playing' => [
                'title' => $metadata['title'] ?? null,
                'artist' => $metadata['artist'] ?? null,
            ],
        ]]);
    }
}
