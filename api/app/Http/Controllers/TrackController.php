<?php

namespace App\Http\Controllers;

use App\Http\Requests\DestroyTracksRequest;
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
 *   DELETE /stations/{station:slug}/tracks            -> destroyMany (track_ids[])
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

        return $this->library($station, $kind);
    }

    /**
     * One list of a station's tracks plus the storage meter — the payload the
     * library screen is built from.
     *
     * Shared by index() and destroyMany() so a bulk delete answers in exactly
     * the shape the client already knows how to apply. `$extra` is merged into
     * `meta` for anything only one caller reports.
     *
     * @param  array<string, mixed>  $extra
     */
    private function library(Station $station, string $kind = Track::KIND_MUSIC, array $extra = []): JsonResponse
    {
        // Music rows carry which playlists they are in — the library view's
        // chips, and its "not in any playlist" warning, come from this. One
        // query for the whole list; jingles are never members.
        $tracks = $station->tracks()
            ->where('kind', $kind)
            ->when($kind === Track::KIND_MUSIC, fn ($query) => $query->with('playlists:playlists.id'))
            ->get();
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
            ] + $extra,
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

        // Validated as one of this station's playlists; null means the
        // default, which TrackImporter resolves. Jingles ignore it.
        $playlistId = $request->playlistId();
        $playlist = $playlistId === null ? null : $station->playlists()->whereKey($playlistId)->first();

        $created = [];
        $errors = [];
        foreach ($request->file('files', []) as $idx => $file) {
            try {
                $created[] = $this->importer->import($station, $file, $kind, $playlist);
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

        // Same shape as index(): the client appends these rows to the library
        // list, which needs to know where they landed.
        foreach ($created as $track) {
            $track->load('playlists:playlists.id');
        }

        return response()->json([
            'data' => TrackResource::collection(collect($created)),
            'errors' => $errors,
        ], $status);
    }

    public function update(UpdateTrackRequest $request, Track $track, PlaylistFileWriter $writer): JsonResponse
    {
        $this->authorize('update', $track);

        $track->update($request->validated());
        // For a jingle, title/artist are baked into the annotate: URIs in
        // jingles.m3u, which Liquidsoap caches on read — without a rewrite,
        // edits stick in the DB but listeners keep hearing the old
        // StreamTitle on every replay. A music track needs none of this (the
        // rotation reads the DB per request), but write() is cheap and
        // idempotent, so it is not worth branching on kind here.
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

    /**
     * Delete several files at once — the library's multi-select.
     *
     * Returns the fresh library rather than 204, because the client has just
     * invalidated its own copy of both the list and the storage meter, and a
     * batch is exactly when guessing at the new totals goes wrong.
     */
    public function destroyMany(DestroyTracksRequest $request, Station $station): JsonResponse
    {
        $this->authorize('deleteAny', [Track::class, $station]);

        $deleted = $this->importer->destroyMany($station, $request->trackIds());

        return $this->library($station, Track::KIND_MUSIC, ['deleted' => $deleted]);
    }

    public function reorder(ReorderTracksRequest $request, Station $station): AnonymousResourceCollection
    {
        $this->authorize('reorder', [Track::class, $station]);

        // Library order only. What plays is a playlist's order, edited on
        // PlaylistTrackController::reorder — this no longer touches it.
        $kind = $request->kind();
        $this->importer->reorder($station, $request->validated('ids'), $kind);

        return TrackResource::collection($station->tracks()->where('kind', $kind)->get());
    }
}
