<?php

namespace App\Http\Controllers;

use App\Models\Track;
use Illuminate\Http\JsonResponse;

/**
 * Returns the absolute file path for a track. Used by the relay
 * to read audio files for ffmpeg playback.
 */
class InternalTrackController extends Controller
{
    public function __invoke(Track $track): JsonResponse
    {
        return response()->json([
            'data' => [
                'id' => $track->id,
                'station_id' => $track->station_id,
                'title' => $track->title,
                'artist' => $track->artist,
                'duration' => $track->duration,
                'path' => $track->full_path,
            ],
        ]);
    }
}
