<?php

namespace App\Services;

use App\Events\StationStateChanged;
use App\Models\Station;
use Illuminate\Support\Facades\Redis;

/**
 * The cached "now playing" for a station, read by the listener-facing API so
 * it never has to round-trip to the audio path.
 *
 * Two writers: a Liquidsoap container's on_metadata push
 * (NowPlayingController), and on the relay path — which has no container to
 * read the webcast metadata frame — the studio itself
 * (StationNowPlayingController). Moved here from NowPlayingController so both
 * clear, store and announce it identically.
 */
class NowPlayingStore
{
    /**
     * Store the current track, or clear it when both parts are empty.
     *
     * @return bool true when something is now playing, false when cleared
     */
    public function set(Station $station, ?string $title, ?string $artist): bool
    {
        $title = $this->cleanup($title);
        $artist = $this->cleanup($artist);

        $key = "metadata:{$station->id}";

        // Was this station saying anything a moment ago? The answer is the
        // only thing that decides whether a dashboard is told about this —
        // see broadcastTransition().
        $wasPlaying = (bool) Redis::exists($key);

        // Empty payload = clear (track ended, broadcaster disconnected, etc.).
        if ($title === null && $artist === null) {
            Redis::del($key);
            $this->broadcastTransition($station, $wasPlaying, false);

            return false;
        }

        Redis::setex(
            $key,
            // Long TTL — the next track-change push will overwrite this.
            // The TTL only matters as a safety net if Liquidsoap (or, on the
            // relay path, the studio) dies mid-track and never sends an
            // "ended" message.
            6 * 3600,
            json_encode(['title' => $title, 'artist' => $artist], JSON_UNESCAPED_UNICODE),
        );

        $this->broadcastTransition($station, $wasPlaying, true);

        return true;
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
