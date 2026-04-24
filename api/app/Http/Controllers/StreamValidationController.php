<?php

namespace App\Http\Controllers;

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use App\Models\StreamSession;
use App\Services\BroadcastStateService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Called by the relay server before allowing a broadcaster to connect.
 *
 * The browser's WebSocket handshake carries the HttpOnly auth cookie to the
 * relay. The relay forwards that cookie here; Laravel remains the source of
 * truth for identity, station ownership, and durable stream sessions.
 */
class StreamValidationController extends Controller
{
    public function __invoke(Request $request, BroadcastStateService $broadcastState): JsonResponse
    {
        $validated = $request->validate([
            'station_id' => ['required', 'string'],
            'device_id' => ['required', 'string', 'max:128'],
            'source_type' => ['sometimes', Rule::in(['browser', 'electron', 'external'])],
        ]);

        $user = $this->resolveUserFromForwardedToken($request);

        if (! $user || ! $user->hasVerifiedEmail()) {
            return response()->json(['valid' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $station = Station::where('slug', $validated['station_id'])->firstOrFail();

        if ($station->user_id !== $user->id) {
            throw new AuthorizationException;
        }

        $deviceId = $validated['device_id'];
        $active = $broadcastState->activeForStation($station);

        if ($active && ! $broadcastState->sameDevice($active, $deviceId)) {
            return response()->json([
                'valid' => false,
                'code' => 'station_already_live',
                'message' => 'This station is already live from another device.',
            ], 409);
        }

        if ($active && $broadcastState->sameDevice($active, $deviceId)) {
            $session = StreamSession::whereKey($active['session_id'] ?? null)
                ->where('station_id', $station->id)
                ->whereNull('ended_at')
                ->first();

            if (! $session) {
                $broadcastState->forget($station);
            }
        }

        if (! isset($session) || ! $session) {
            $wasLive = $station->is_live;
            $station->streamSessions()->whereNull('ended_at')->update(['ended_at' => now()]);

            $session = $station->streamSessions()->create([
                'started_at' => now(),
                'source_type' => $validated['source_type'] ?? 'browser',
            ]);

            $broadcastState->markStarting($station, $session, $deviceId);
            $station->update(['is_live' => true]);

            if (! $wasLive) {
                SendStationLiveNotifications::dispatch($station->id, $session->id)
                    ->delay(now()->addMinutes(2));
            }
        }

        return response()->json([
            'valid' => true,
            'station' => [
                'id' => $station->id,
                'slug' => $station->slug,
                'icecast_mount' => $station->icecast_mount,
                'icecast_password' => $station->icecast_password,
                'session_id' => $session->id,
                'user_id' => $station->user_id,
                'device_id' => $deviceId,
            ],
        ]);
    }

    private function resolveUserFromForwardedToken(Request $request): mixed
    {
        $token = $request->bearerToken() ?: $request->cookie('token');

        if (! is_string($token) || $token === '') {
            return null;
        }

        $accessToken = PersonalAccessToken::findToken($token);

        return $accessToken?->tokenable;
    }
}
