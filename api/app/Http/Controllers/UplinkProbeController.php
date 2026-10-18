<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The far end of the studio's go-live connection check.
 *
 * The browser uploads a throwaway body and times how long this takes to
 * answer, which is how it picks an ingest bitrate its upload can carry, or
 * refuses to go live on a line that can't carry any (client/lib/uplinkProbe.ts).
 * Nothing is kept: the body is read so the timing covers the whole upload,
 * and its size is returned only to show it arrived.
 */
class UplinkProbeController extends Controller
{
    /** The client sends 96 KB. Anything much bigger is not a probe. */
    private const MAX_BYTES = 256 * 1024;

    /**
     * By the time this runs PHP-FPM has already read the body, so these
     * checks bound what the controller accepts, not what the server reads:
     * the real cap on the read is nginx's (infra/native/nginx/gocast-api.conf,
     * `location = /api/broadcast/uplink-probe`). The length after reading
     * also covers a chunked upload, which declares no Content-Length.
     */
    public function __invoke(Request $request): JsonResponse
    {
        abort_if((int) $request->header('Content-Length', 0) > self::MAX_BYTES, 413);

        $bytes = strlen($request->getContent());

        abort_if($bytes > self::MAX_BYTES, 413);

        return response()->json(['bytes' => $bytes]);
    }
}
