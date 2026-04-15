<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Redis;

/**
 * Public endpoint returning real-time listener count and now-playing info for a station.
 */
class ListenerCountController extends Controller
{
    public function show(string $slug): JsonResponse
    {
        $station = Station::where('slug', $slug)->firstOrFail();

        $count = (int) Redis::get("listeners:{$station->id}") ?: 0;
        $metadata = json_decode(Redis::get("metadata:{$station->id}") ?: '{}', true);

        return response()->json(['data' => [
            'count' => $count,
            'is_live' => $station->is_live,
            'now_playing' => [
                'title' => $metadata['title'] ?? null,
                'artist' => $metadata['artist'] ?? null,
            ],
        ]]);
    }
}
