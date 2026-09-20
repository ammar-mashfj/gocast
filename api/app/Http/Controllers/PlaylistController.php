<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePlaylistRequest;
use App\Http\Requests\UpdatePlaylistRequest;
use App\Http\Resources\PlaylistResource;
use App\Models\Playlist;
use App\Models\Station;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * A station's playlists — the named rotations AutoDJ can play.
 *
 * Routes (see routes/api.php):
 *   GET    /stations/{station:slug}/playlists   -> index
 *   POST   /stations/{station:slug}/playlists   -> store   (name, order?)
 *   PATCH  /playlists/{playlist}                -> update  (name?, order?, is_default?)
 *   DELETE /playlists/{playlist}                -> destroy (409 on the default)
 *
 * Not plan-gated, on purpose, matching how the jingle settings are
 * treated: a playlist is configuration, and the entitlement
 * that matters is enforced where the audio is — AutoDjScheduler::next()
 * answers "nothing to play" for a free owner whatever they have arranged.
 * Uploading, the action that actually builds a library, stays gated in
 * TrackController::store. The UI locks creation for free accounts so the
 * arrangement is never misleading.
 */
class PlaylistController extends Controller
{
    use AuthorizesRequests;

    public function index(Station $station): AnonymousResourceCollection
    {
        $this->authorize('viewAny', [Playlist::class, $station]);

        return PlaylistResource::collection(
            $this->withAggregates($station->playlists())->get(),
        );
    }

    public function store(StorePlaylistRequest $request, Station $station): JsonResponse
    {
        $this->authorize('create', [Playlist::class, $station]);

        $data = $request->validated();

        $playlist = $station->playlists()->create([
            'name' => $data['name'],
            'order' => $data['order'] ?? Playlist::ORDER_SEQUENTIAL,
            'position' => ((int) $station->playlists()->max('position')) + 1,
        ]);

        return (new PlaylistResource($this->reloadAggregates($playlist)))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdatePlaylistRequest $request, Playlist $playlist): PlaylistResource
    {
        $this->authorize('update', $playlist);

        $data = $request->validated();

        DB::transaction(function () use ($playlist, $data) {
            // The default moves as one write: the old default gives it up in
            // the same transaction the new one claims it, so no reader ever
            // sees a station with two defaults or none.
            if (($data['is_default'] ?? false) && ! $playlist->is_default) {
                Playlist::query()
                    ->where('station_id', $playlist->station_id)
                    ->where('is_default', true)
                    ->update(['is_default' => false]);

                $playlist->forceFill(['is_default' => true]);
            }

            $playlist->fill(array_intersect_key($data, array_flip(['name', 'order'])))->save();
        });

        return new PlaylistResource($this->reloadAggregates($playlist));
    }

    public function destroy(Playlist $playlist): Response|JsonResponse
    {
        $this->authorize('delete', $playlist);

        // A station with no default has nothing to play when no slot is
        // active. Claim the default elsewhere first, then delete this one.
        if ($playlist->is_default) {
            return response()->json([
                'message' => 'The default playlist cannot be deleted. Make another playlist the default first.',
            ], 409);
        }

        // Members go with the pivot's cascade; the tracks themselves stay in
        // the library. Slots pointing here (Phase 3) cascade the same way.
        $playlist->delete();

        return response()->noContent();
    }

    /**
     * @param  HasMany<Playlist, Station>  $query
     * @return HasMany<Playlist, Station>
     */
    private function withAggregates($query)
    {
        return $query
            ->withCount('tracks')
            ->withSum('tracks', 'duration_seconds');
    }

    private function reloadAggregates(Playlist $playlist): Playlist
    {
        return $playlist
            ->loadCount('tracks')
            ->loadSum('tracks', 'duration_seconds');
    }
}
