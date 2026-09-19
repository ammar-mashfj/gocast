<?php

namespace App\Http\Controllers;

use App\Events\StationStateChanged;
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

        $key = "metadata:{$station->id}";

        // Was this station saying anything a moment ago? The answer is the
        // only thing that decides whether a dashboard is told about this —
        // see broadcastTransition().
        $wasPlaying = (bool) Redis::exists($key);

        // Empty payload = clear (track ended, broadcaster disconnected, etc.).
        if ($title === null && $artist === null) {
            Redis::del($key);
            $this->broadcastTransition($station, $wasPlaying, false);

            return response()->json(['ok' => true, 'cleared' => true]);
        }

        Redis::setex(
            $key,
            // Long TTL — the next track-change push will overwrite this.
            // The TTL only matters as a safety net if Liquidsoap dies
            // mid-track and never sends an "ended" message.
            6 * 3600,
            json_encode(['title' => $title, 'artist' => $artist], JSON_UNESCAPED_UNICODE),
        );

        $this->broadcastTransition($station, $wasPlaying, true);

        return response()->json(['ok' => true]);
    }

    /**
     * Tell an open dashboard when this station STARTS or STOPS saying
     * anything — never when it merely changes what it says.
     *
     * The distinction is the whole design. A track change is one of these
     * pushes every ~3.5 minutes, around 12,300 messages per station per
     * month, and it is the least interesting update on the page: the
     * dashboard's poll already times its next read off `remaining`, so it
     * lands on a track boundary without being told. Broadcasting those would
     * be 95% of the message bill for something already solved.
     *
     * Silence is different, and it is the case that exposed this. A station
     * on the silence bed has no `remaining` to time anything against, so the
     * track-aware rule cannot see its exit coming and the card sits on
     * "Silence — add tracks or go live" for the whole poll interval after the
     * owner has done exactly what it asked. That transition happens once, not
     * once per track, so it costs almost nothing to announce.
     */
    private function broadcastTransition(Station $station, bool $was, bool $now): void
    {
        if ($was === $now) {
            return;
        }

        event(StationStateChanged::for($station, $now ? 'audio_started' : 'audio_stopped'));
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
