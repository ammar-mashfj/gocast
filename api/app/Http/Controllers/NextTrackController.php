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
 *
 * A station whose owner is not on an AutoDJ plan gets that same 204, from the
 * guard in AutoDjScheduler::next(). It is not an error case and must not look
 * like one: the container is running and correct, it simply has nothing it may
 * play, which is indistinguishable here from an empty library.
 */
class NextTrackController extends Controller
{
    public function __invoke(Request $request, AutoDjScheduler $scheduler): Response
    {
        $validated = $request->validate([
            'slug' => ['required', 'string', 'max:255'],
        ]);

        // user.plan eager loaded because AutoDjScheduler::next() checks the
        // owner's entitlement before it picks anything. Left lazy it would be
        // two extra queries per track boundary on every running station, on
        // the one path where latency turns into late audio.
        $station = Station::query()
            ->with('user.plan')
            ->where('slug', $validated['slug'])
            ->first();

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
