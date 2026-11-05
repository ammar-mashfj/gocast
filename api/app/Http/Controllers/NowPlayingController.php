<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\NowPlayingStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Receives current-track metadata pushes from a station's Liquidsoap
 * container. The .liq script's on_metadata callback fires on every track
 * change (and on the broadcaster connecting/disconnecting) and POSTs
 * here. We cache the payload in Redis so the listener-facing API can
 * surface "now playing" without round-tripping to Liquidsoap.
 *
 * Authenticated via the `internal` middleware (X-Internal-Key header), so
 * it's not abusable from outside the network even though the api port is
 * exposed in dev. The Liquidsoap template embeds the same key.
 */
class NowPlayingController extends Controller
{
    public function __invoke(Request $request, NowPlayingStore $nowPlaying): JsonResponse
    {
        $data = $request->validate([
            'slug' => ['required', 'string', 'regex:/^[a-z0-9-]+$/', 'max:255'],
            'title' => ['nullable', 'string', 'max:500'],
            'artist' => ['nullable', 'string', 'max:500'],
        ]);

        $station = Station::where('slug', $data['slug'])->first();
        if ($station === null) {
            return response()->json(['ok' => false, 'error' => 'unknown station'], 404);
        }

        $playing = $nowPlaying->set($station, $data['title'] ?? null, $data['artist'] ?? null);

        return response()->json($playing ? ['ok' => true] : ['ok' => true, 'cleared' => true]);
    }
}
