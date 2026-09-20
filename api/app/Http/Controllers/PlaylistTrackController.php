<?php

namespace App\Http\Controllers;

use App\Http\Requests\PlaylistTracksRequest;
use App\Http\Requests\ReorderPlaylistTracksRequest;
use App\Http\Resources\TrackResource;
use App\Models\Playlist;
use App\Models\Track;
use App\Services\PlaylistTracks;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Which tracks are in a playlist, and in what order.
 *
 * Routes (see routes/api.php):
 *   GET    /playlists/{playlist}/tracks            -> index    (ordered)
 *   PUT    /playlists/{playlist}/tracks            -> replace  (track_ids[] — the whole set)
 *   POST   /playlists/{playlist}/tracks            -> store    (track_ids[] — appended)
 *   PATCH  /playlists/{playlist}/tracks/reorder    -> reorder  (ids[])
 *   DELETE /playlists/{playlist}/tracks/{track}    -> destroy  (remove from THIS playlist only)
 *
 * Every write answers with the playlist's full ordered list, so the client
 * can replace its state rather than reconcile it. `position` on each track
 * in these responses is the position IN THIS PLAYLIST (see TrackResource).
 *
 * Authorization is `update` on the playlist throughout: membership is an
 * edit to the playlist, not to the tracks.
 */
class PlaylistTrackController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly PlaylistTracks $members) {}

    public function index(Playlist $playlist): AnonymousResourceCollection
    {
        $this->authorize('view', $playlist);

        return $this->members($playlist);
    }

    public function replace(PlaylistTracksRequest $request, Playlist $playlist): AnonymousResourceCollection
    {
        $this->authorize('update', $playlist);

        $this->members->replace($playlist, $request->trackIds());

        return $this->members($playlist);
    }

    public function store(PlaylistTracksRequest $request, Playlist $playlist): AnonymousResourceCollection
    {
        $this->authorize('update', $playlist);

        $this->members->attach($playlist, $request->trackIds());

        return $this->members($playlist);
    }

    public function reorder(ReorderPlaylistTracksRequest $request, Playlist $playlist): AnonymousResourceCollection
    {
        $this->authorize('update', $playlist);

        $this->members->reorder($playlist, $request->ids());

        return $this->members($playlist);
    }

    public function destroy(Playlist $playlist, Track $track): Response
    {
        $this->authorize('update', $playlist);

        // {track} is bound on its own, not scoped through the playlist, so
        // a track that exists but is not a member is a 404 here rather than
        // a silent no-op — the client's list is stale and should refetch.
        if (! $playlist->tracks()->whereKey($track->getKey())->exists()) {
            abort(404);
        }

        $this->members->detach($playlist, $track);

        return response()->noContent();
    }

    private function members(Playlist $playlist): AnonymousResourceCollection
    {
        return TrackResource::collection($playlist->tracks()->get());
    }
}
