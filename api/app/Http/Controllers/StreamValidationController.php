<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class StreamValidationController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'station_id' => ['required', 'string'],
            'token' => ['required', 'string'],
        ]);

        $station = Station::findOrFail($request->station_id);
        $cachedToken = Cache::get("stream-token:{$station->id}");

        if (! $cachedToken || $cachedToken !== $request->token) {
            return response()->json(['valid' => false, 'message' => 'Invalid token.'], 401);
        }

        Cache::forget("stream-token:{$station->id}");

        return response()->json([
            'valid' => true,
            'station' => [
                'id' => $station->id,
                'slug' => $station->slug,
                'icecast_mount' => $station->icecast_mount,
                'icecast_password' => $station->icecast_password,
            ],
        ]);
    }
}
