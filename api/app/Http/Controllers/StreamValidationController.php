<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Called by the relay server to validate a stream token before allowing a broadcaster to connect.
 *
 * Looks up the station by slug, verifies the cached one-time token, then
 * returns Icecast mount credentials so the relay can proxy the audio stream.
 * The token is consumed (deleted from cache) after successful validation.
 */
class StreamValidationController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'station_id' => ['required', 'string'],
            'token' => ['required', 'string'],
        ]);

        $station = Station::where('slug', $request->station_id)->firstOrFail();
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
