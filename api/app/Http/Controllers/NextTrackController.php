<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\AutoDjScheduler;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Answers a station container's "what do I play next?".
 *
 * Called by `request.dynamic` in the rendered .liq once per track boundary,
 * behind the internal key like every other container-to-Laravel call. The
 * response body is a bare Liquidsoap `annotate:` URI — text/plain rather than
 * JSON because the script feeds it straight into `request.create()`, and a
 * JSON envelope would only be something for the audio path to unwrap.
 *
 * This endpoint is load-bearing for audio: if it is slow, tracks start late;
 * if it 500s, the rotation stops. Hence no work here beyond a lookup and a
 * single-row cursor update, and hence 204 rather than an error for the
 * ordinary "this station has no tracks" case — the script must be able to tell
 * "nothing to play" from "something is broken", and only the second is worth
 * logging in a container's stderr.
 */
class NextTrackController extends Controller
{
    public function __invoke(Request $request, AutoDjScheduler $scheduler): Response
    {
        $validated = $request->validate([
            'slug' => ['required', 'string', 'max:255'],
        ]);

        $station = Station::query()->where('slug', $validated['slug'])->first();

        if ($station === null) {
            return response('', 404);
        }

        $uri = $scheduler->next($station);

        if ($uri === null) {
            return response('', 204);
        }

        return response($uri, 200)->header('Content-Type', 'text/plain');
    }
}
