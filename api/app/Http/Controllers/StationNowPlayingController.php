<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\IcecastAdmin;
use App\Services\NowPlayingStore;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The studio's "now playing" on the relay path.
 *
 * On the container path the studio sends the title inside the webcast socket
 * and Liquidsoap pushes it to /internal/now-playing. The relay copies audio
 * and nothing else, so a relay studio sends it here instead — to the same
 * store, plus Icecast's own metadata so players reading the stream directly
 * (VLC, car radios) show it too.
 *
 * Owner only, and only while the station is on the relay path: a container
 * station's title belongs to its container, and a second writer would fight it.
 */
class StationNowPlayingController extends Controller
{
    use AuthorizesRequests;

    public function __invoke(
        Request $request,
        Station $station,
        NowPlayingStore $nowPlaying,
        IcecastAdmin $icecast,
    ): JsonResponse {
        $this->authorize('update', $station);

        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:500'],
            'artist' => ['nullable', 'string', 'max:500'],
        ]);

        if (! $station->usesRelay()) {
            return response()->json(['message' => 'This station is not on the relay path.'], 409);
        }

        // A title is only for a show on air. Without this a studio's late
        // retry, landing after its show closed, would bring back "now playing"
        // for six hours on a station nobody is on. Icecast is asked as well
        // as the session row: the studio sends its first title the moment the
        // relay lets it in, which can be before source-connect opens the row.
        if (! $station->isLive() && $icecast->carries($station->icecast_mount) !== true) {
            return response()->json(['message' => 'Nobody is broadcasting on this station.'], 409);
        }

        $playing = $nowPlaying->set($station, $data['title'] ?? null, $data['artist'] ?? null);

        $icecast->updateMetadata(
            $station,
            $playing ? ($data['title'] ?? null) : null,
            $playing ? ($data['artist'] ?? null) : null,
        );

        return response()->json(['ok' => true, 'playing' => $playing]);
    }
}
