<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StreamSession;
use App\Services\BroadcastStateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * MediaMTX path-lifecycle hooks.
 *
 * MediaMTX has two per-path hooks we use:
 *   - runOnReady     → fired when a publisher connects and the path is ready.
 *                      We mark the station live, open a StreamSession.
 *   - runOnNotReady  → fired when the publisher disconnects and the path
 *                      goes idle. We close the StreamSession and clear cache.
 *
 * MediaMTX doesn't have a native HTTP webhook for these — it runs a shell
 * command. We configure the command in mediamtx.yml as a `curl` to these
 * endpoints, passing the station path as JSON.
 */
class MediaMtxLifecycleController extends Controller
{
    public function ready(Request $request, BroadcastStateService $broadcastState): JsonResponse
    {
        $station = $this->stationFromPath($request);
        if ($station === null) {
            return response()->json(['ok' => false, 'error' => 'station not found'], 404);
        }

        $connectionId = (string) $request->input('id', 'mediamtx');

        // MediaMTX retries runOnReady on transient HTTP failures — so this
        // hook can fire twice for the same publisher. Reuse the existing
        // open session if there is one (idempotent), only opening a new
        // session when the slot is genuinely empty.
        $session = $station->streamSessions()->whereNull('ended_at')->latest('started_at')->first();
        if ($session === null) {
            $session = $station->streamSessions()->create([
                'started_at' => now(),
                'source_type' => 'browser',
            ]);
        }

        $broadcastState->markLive($station, $session, deviceId: 'mediamtx', connectionId: $connectionId);

        // The open session above is what makes this station read as live —
        // there is no flag to flip. That also means a duplicate webhook no
        // longer touches the stations row, so it cannot fire
        // StationObserver::updated() and restart Liquidsoap mid-broadcast.
        Log::info('MediaMTX publisher ready', ['station' => $station->slug, 'session' => $session->id]);

        return response()->json(['ok' => true]);
    }

    public function notReady(Request $request, BroadcastStateService $broadcastState): JsonResponse
    {
        $station = $this->stationFromPath($request);
        if ($station === null) {
            return response()->json(['ok' => false, 'error' => 'station not found'], 404);
        }

        // Close any active session for this station.
        StreamSession::where('station_id', $station->id)
            ->whereNull('ended_at')
            ->update(['ended_at' => now()]);

        $broadcastState->forget($station);

        // Clear the now-playing payload immediately so the listener-facing
        // API stops showing the last broadcaster track. Without this, the
        // metadata persists until its 6h TTL fires.
        Redis::del("metadata:{$station->id}");

        Log::info('MediaMTX publisher gone', ['station' => $station->slug]);

        return response()->json(['ok' => true]);
    }

    /**
     * MediaMTX path format is "{slug}/live" — first segment is the slug.
     * Rejects empty paths, leading slashes, and anything that doesn't match
     * the Str::slug() character set we use when stations are created.
     */
    private function stationFromPath(Request $request): ?Station
    {
        $path = ltrim((string) $request->input('path', ''), '/');
        $slug = explode('/', $path)[0] ?? '';

        if (! preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/', $slug)) {
            return null;
        }

        return Station::where('slug', $slug)->first();
    }
}
