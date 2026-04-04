<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StreamSession;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;

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

    public function store(Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        if ($station->streamSessions()->whereNull('ended_at')->exists()) {
            return response()->json(['message' => 'Station is already live.'], 409);
        }

        $session = $station->streamSessions()->create([
            'started_at' => now(),
        ]);

        $station->update(['is_live' => true]);

        return response()->json([
            'data' => $session,
            'message' => 'Stream started.',
        ], 201);
    }

    public function destroy(Station $station, StreamSession $session): JsonResponse
    {
        $this->authorize('update', $station);

        $session->update(['ended_at' => now()]);
        $station->update(['is_live' => false]);

        return response()->json([
            'data' => $session,
            'message' => 'Stream ended.',
        ]);
    }
}
