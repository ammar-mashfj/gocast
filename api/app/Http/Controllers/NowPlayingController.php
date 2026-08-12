<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

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
    public function __invoke(Request $request): JsonResponse
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

        $title = $this->cleanup($data['title'] ?? null);
        $artist = $this->cleanup($data['artist'] ?? null);

        // Empty payload = clear (track ended, broadcaster disconnected, etc.).
        if ($title === null && $artist === null) {
            Redis::del("metadata:{$station->id}");

            return response()->json(['ok' => true, 'cleared' => true]);
        }

        Redis::setex(
            "metadata:{$station->id}",
            // Long TTL — the next track-change push will overwrite this.
            // The TTL only matters as a safety net if Liquidsoap dies
            // mid-track and never sends an "ended" message.
            6 * 3600,
            json_encode(['title' => $title, 'artist' => $artist], JSON_UNESCAPED_UNICODE),
        );

        return response()->json(['ok' => true]);
    }

    private function cleanup(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
