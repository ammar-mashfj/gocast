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
     * Content-Length is checked before the body is read, so an oversized
     * upload is refused without buffering it. The length after reading still
     * guards a chunked upload, which declares none.
     */
    public function __invoke(Request $request): JsonResponse
    {
        abort_if((int) $request->header('Content-Length', 0) > self::MAX_BYTES, 413);

        $bytes = strlen($request->getContent());

        abort_if($bytes > self::MAX_BYTES, 413);

        return response()->json(['bytes' => $bytes]);
    }
}
