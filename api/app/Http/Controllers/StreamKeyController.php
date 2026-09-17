<?php

namespace App\Http\Controllers;

use App\Http\Resources\StationResource;
use App\Models\Station;
use App\Models\StationEvent;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mints a new encoder password for a station.
 *
 * Its own endpoint rather than a field on PATCH /stations/{slug}, for the same
 * reason `watermarked` is absent from UpdateStationRequest: a user must not be
 * one request away from CHOOSING their own credential. Rotation is the only
 * write, the server picks the value, and the request carries no body at all.
 *
 * Gated on the plan as well as on ownership. The gate that matters is in
 * HarborAuthController — that is what a connection attempt hits — but a free
 * account should not be able to churn a key it cannot use either.
 *
 * WHAT THIS DOES NOT DO: disconnect a broadcaster. Harbor authenticates once,
 * when the socket opens, so an encoder already publishing keeps publishing
 * with the old key until it next reconnects. That is worth knowing before
 * reaching for this as a panic button, and the settings card says it in as
 * many words. To actually cut someone off, take the station off air and
 * confirm the cut-off — StationPowerController::stop() accepts `force` for
 * exactly this, and the pair is the answer to a leaked key: cut the broadcast,
 * then rotate so it cannot come back.
 */
class StreamKeyController extends Controller
{
    use AuthorizesRequests;

    public function rotate(Request $request, Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        if (! $request->user()->canUseEncoder()) {
            return response()->json([
                'code' => 'encoder_not_available',
                'message' => 'Broadcasting from an external encoder is a Pro feature.',
            ], Response::HTTP_FORBIDDEN);
        }

        $station->rotateStreamKey();

        // Admin monitoring only, and deliberately without the key in the
        // properties — a timeline is the wrong place for a live credential.
        // Nothing branches on this; see StationEvent.
        StationEvent::record(
            $station,
            StationEvent::TYPE_STREAM_KEY_ROTATED,
            StationEvent::SOURCE_OWNER,
        );

        // withEncoder(), because the new key IS the response: the card reads
        // it straight off this payload rather than waiting for the settings
        // page to refetch, so that the field never shows the dead key at the
        // one moment somebody is looking at it to copy.
        return response()->json([
            'data' => (new StationResource($station))->withEncoder(),
            'message' => 'Stream key rotated. Paste the new one into your encoder.',
        ]);
    }
}
