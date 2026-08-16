<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastTokenService;
use App\Services\StationLifecycleException;
use App\Services\StationLifecycleService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * MediaMTX auth webhook.
 *
 * MediaMTX POSTs every publish/read attempt here:
 *   { user, password, ip, action, path, protocol, id, query }
 *
 *   - action: "publish" | "read" | "playback" | "api" | "metrics" | "pprof"
 *   - path: e.g. "live-jazz-247/live"
 *   - query: query string from the WHIP URL (we put the broadcaster token here)
 *
 * Returns:
 *   - 200: allowed
 *   - any 4xx/5xx: denied
 *
 * Auth model:
 *   - Reads (RTSP pulls from Liquidsoap, HLS playback) are unauthenticated.
 *     The network is firewalled at the host level — only Liquidsoap
 *     containers and listeners reach MediaMTX. If you ever expose RTSP on
 *     the public internet, add token-gating here.
 *   - Writes (publish): require a short-lived station-scoped token in
 *     ?token=..., verified against BroadcastTokenService. The token is
 *     bound to {user, station} and expires after 60 seconds, so a leaked
 *     URL doesn't give long-lived publish rights to anyone.
 */
class MediaMtxAuthController extends Controller
{
    public function __invoke(
        Request $request,
        BroadcastTokenService $tokens,
        StationLifecycleService $lifecycle,
    ): Response {
        $action = (string) $request->input('action');
        $path = (string) $request->input('path');
        $query = (string) $request->input('query', '');

        // Reads (RTSP from Liquidsoap, HLS, etc.) — allow.
        if (in_array($action, ['read', 'playback'], true)) {
            return response('', Response::HTTP_OK);
        }

        // Publishes — require a valid station-scoped broadcaster token.
        if ($action !== 'publish') {
            return response('Forbidden', Response::HTTP_FORBIDDEN);
        }

        $slug = $this->stationSlugFromPath($path);
        if ($slug === null) {
            return response('Invalid path', Response::HTTP_FORBIDDEN);
        }

        $token = $this->extractToken($query, $request);
        if ($token === null) {
            return response('Missing token', Response::HTTP_FORBIDDEN);
        }

        if ($tokens->verify($token, $slug) === null) {
            return response('Invalid or expired broadcast token', Response::HTTP_FORBIDDEN);
        }

        // Tokens are self-contained (no DB hit on verify), so a token minted
        // moments before the station was deleted would still MAC-validate.
        // Confirm the station is really there before letting anyone publish.
        $station = Station::where('slug', $slug)->first();
        if ($station === null) {
            return response('Unknown station', Response::HTTP_FORBIDDEN);
        }

        // Going live is a stronger statement of intent than the power button,
        // so a stopped station is started here rather than the publish being
        // refused. This also covers a station that *is* started but whose
        // container was OOM-killed — without it the broadcaster publishes
        // happily, the UI says "live", and not one listener hears anything.
        // Cheap when healthy (a single `docker ps`).
        //
        // Plan limits are the one thing that can still refuse a publish: if
        // the concurrency cap could be dodged by going live instead of
        // pressing start, it wouldn't be a cap.
        try {
            $lifecycle->ensureRunning($station);
        } catch (StationLifecycleException $e) {
            Log::info('WHIP auth: publish refused by plan limit', [
                'station' => $station->slug,
                'code' => $e->errorCode,
            ]);

            return response($e->getMessage(), Response::HTTP_FORBIDDEN);
        } catch (Throwable $e) {
            // Any other failure (busy daemon, lock contention) must not block
            // the broadcast — a broadcast with a broken AutoDJ chain still
            // beats refusing to go live at all, and the reconciler will bring
            // the container up within minutes.
            Log::error('WHIP auth: Liquidsoap ensure failed', [
                'station' => $station->slug,
                'error' => $e->getMessage(),
            ]);
        }

        return response('', Response::HTTP_OK);
    }

    /**
     * Path format is "{slug}/live" — first segment is the station slug.
     * Reject empty paths, leading slashes (which would put "" in segment 0),
     * and any traversal sequences a slug should never contain.
     */
    private function stationSlugFromPath(string $path): ?string
    {
        $path = ltrim($path, '/');

        if ($path === '' || Str::contains($path, ['..', '\\'])) {
            return null;
        }

        $segments = explode('/', $path);
        $slug = $segments[0] ?? '';

        // Slugs are produced by Str::slug() — lowercase alphanumerics + hyphens.
        // Anything else is suspicious; reject to keep this surface narrow.
        if (! preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/', $slug)) {
            return null;
        }

        return $slug;
    }

    /**
     * Pull the token from "?token=xxx" or from the Authorization header
     * if a client (e.g. an OBS plugin) forwards it that way.
     */
    private function extractToken(string $query, Request $request): ?string
    {
        parse_str($query, $params);
        if (! empty($params['token'])) {
            return (string) $params['token'];
        }

        return $request->bearerToken();
    }
}
