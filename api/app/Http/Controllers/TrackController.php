<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReorderTracksRequest;
use App\Http\Requests\StoreTrackRequest;
use App\Http\Requests\UpdateTrackRequest;
use App\Http\Resources\TrackResource;
use App\Models\Station;
use App\Models\Track;
use App\Services\PlaylistFileWriter;
use App\Services\StationLifecycleService;
use App\Services\TrackImporter;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * AutoDJ track management for a station.
 *
 * Routes (see routes/api.php):
 *   GET    /stations/{station:slug}/tracks            -> index    (?kind=)
 *   POST   /stations/{station:slug}/tracks            -> store    (multipart, files[], kind)
 *   PATCH  /stations/{station:slug}/tracks/reorder    -> reorder  (ids[], kind)
 *   PATCH  /tracks/{track}                            -> update   (title, artist)
 *   DELETE /tracks/{track}                            -> destroy
 *
 * Every list-scoped route takes an optional `kind` — "music" (the rotation,
 * and the default) or "jingle" (station IDs). The two lists are separate
 * sequences over the same storage quota; `update` and `destroy` need no kind
 * because the track itself carries it.
 */
class TrackController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly TrackImporter $importer,
        private readonly StationLifecycleService $lifecycle,
    ) {}

    public function index(Request $request, Station $station): JsonResponse
    {
        $this->authorize('viewAny', [Track::class, $station]);

        $kind = $request->validate([
            'kind' => ['sometimes', Rule::in(Track::KINDS)],
        ])['kind'] ?? Track::KIND_MUSIC;

        $tracks = $station->tracks()->where('kind', $kind)->get();
        $cap = (int) config('liquidsoap.station_storage_bytes');
        // Usage is deliberately NOT scoped to `kind`: one cap covers the
        // whole station, so the meter must read the same number whichever
        // list you are looking at.
        $used = (int) $station->tracks()->sum('file_size_bytes');

        return response()->json([
            'data' => TrackResource::collection($tracks),
            'meta' => [
                'kind' => $kind,
                'storage_used_bytes' => $used,
                'storage_cap_bytes' => $cap,
            ],
        ]);
    }

    public function store(StoreTrackRequest $request, Station $station): JsonResponse
    {
        $this->authorize('create', [Track::class, $station]);

        // AutoDJ is a paid feature: uploading is the action that builds a
        // library, so this is where the plan is enforced. Listing and
        // deleting stay open on every plan — a downgrade must never trap
        // someone's files behind a paywall.
        $this->lifecycle->assertAutoDjEnabled($request->user());

        $kind = $request->kind();

        $created = [];
        $errors = [];
        foreach ($request->file('files', []) as $idx => $file) {
            try {
                $created[] = $this->importer->import($station, $file, $kind);
            } catch (RuntimeException $e) {
                // Quota exceeded mid-batch — surface which file and stop;
                // partial successes are kept (status code reflects that).
                $errors[] = ['index' => $idx, 'message' => $e->getMessage()];
                break;
            }
        }

        // Pure success → 201. Pure failure → 422. Partial success (some
        // files made it before the quota tripped) → 207 so the client can
        // distinguish from "all good" and surface the per-file error.
        $status = match (true) {
            $created !== [] && $errors === [] => 201,
            $created === [] && $errors !== [] => 422,
            default => 207,
        };

        return response()->json([
            'data' => TrackResource::collection(collect($created)),
            'errors' => $errors,
        ], $status);
    }

    public function update(UpdateTrackRequest $request, Track $track, PlaylistFileWriter $writer): JsonResponse
    {
        $this->authorize('update', $track);

        $track->update($request->validated());
        // Title/artist are stamped into the m3u's EXTINF lines, which
        // Liquidsoap caches on read. Without a reload, edits stick in the DB
        // but listeners keep hearing the old StreamTitle on every replay
        // until LS reloads for some other reason. In LS 2.4 the currently-
        // playing track survives a reload (only the queue rebuilds), so the
        // listener-side cost is essentially zero.
        $writer->write($track->station);
        $writer->reload($track->station);

        return response()->json(['data' => new TrackResource($track)]);
    }

    public function destroy(Track $track): Response
    {
        $this->authorize('delete', $track);

        $this->importer->destroy($track);

        return response()->noContent();
    }

    public function reorder(ReorderTracksRequest $request, Station $station): AnonymousResourceCollection
    {
        $this->authorize('reorder', [Track::class, $station]);

        $kind = $request->kind();
        $this->importer->reorder($station, $request->validated('ids'), $kind);

        return TrackResource::collection($station->tracks()->where('kind', $kind)->get());
    }
}
