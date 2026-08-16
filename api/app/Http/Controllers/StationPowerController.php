<?php

namespace App\Http\Controllers;

use App\Http\Resources\StationResource;
use App\Models\Station;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistFileWriter;
use App\Services\StationLifecycleService;
use App\Services\StationStatusService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The station power switch.
 *
 * Creating a station no longer puts it on air — a station row is a
 * configuration, not a running process. The owner builds their playlist,
 * sets artwork and genre, and then presses start, which is the point at
 * which a Liquidsoap container gets spawned and the Icecast mount appears.
 *
 * Both actions return the station so the SPA can re-render from one payload.
 * Neither waits for audio to actually flow: `docker run` returns when the
 * container is spawned, and Liquidsoap needs a few more seconds to build its
 * graph and connect to Icecast. The client polls GET /stations/{slug}/status
 * for readiness — see StationStatusController.
 */
class StationPowerController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly StationLifecycleService $lifecycle,
        private readonly StationStatusService $status,
    ) {}

    public function start(Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        $this->lifecycle->start($station);
        $this->status->forget($station);

        return (new StationResource($station->refresh()))
            ->response()
            ->setStatusCode(202);
    }

    public function stop(Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        $this->lifecycle->stop($station);
        $this->status->forget($station);

        return (new StationResource($station->refresh()))
            ->response()
            ->setStatusCode(200);
    }

    /**
     * Skip the track AutoDJ is playing.
     *
     * Liquidsoap has always exposed this over telnet — the playlist source
     * registers `skip` alongside `reload` — we simply never called it. The
     * skip lands within a frame; no restart, no reload, no effect on the
     * playlist itself.
     */
    public function skip(Station $station, LiquidsoapSupervisor $supervisor): JsonResponse
    {
        $this->authorize('update', $station);

        if (! $station->isRunning()) {
            return response()->json([
                'message' => 'This station is off air.',
                'code' => 'station_not_running',
            ], 409);
        }

        try {
            $supervisor->telnet($station, PlaylistFileWriter::LIQ_SOURCE.'.skip');
        } catch (Throwable $e) {
            // The container is starting, restarting or wedged. Nothing was
            // skipped and nothing is broken — say so plainly.
            Log::info('Skip failed', ['station' => $station->slug, 'error' => $e->getMessage()]);

            return response()->json([
                'message' => 'The station is not responding yet. Try again in a moment.',
                'code' => 'station_unreachable',
            ], 503);
        }

        $this->status->forget($station);

        return response()->json(['message' => 'Skipped.']);
    }
}
