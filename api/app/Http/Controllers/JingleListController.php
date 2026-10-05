<?php

namespace App\Http\Controllers;

use App\Http\Requests\JingleListRequest;
use App\Http\Resources\JingleListResource;
use App\Models\JingleList;
use App\Models\Station;
use App\Services\TrackImporter;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * A station's jingle lists and their rules.
 *
 * Routes (see routes/api.php):
 *   GET    /stations/{station:slug}/jingle-lists  -> index
 *   POST   /stations/{station:slug}/jingle-lists  -> store   (name + rule fields)
 *   PATCH  /jingle-lists/{jingleList}             -> update  (any rule field)
 *   DELETE /jingle-lists/{jingleList}             -> destroy (and its jingles)
 *
 * Not plan-gated, like playlists: a rule is configuration, and the
 * entitlement is enforced where the audio is — AutoDjScheduler::next()
 * hands nothing to a station whose owner has no AutoDJ. Nothing here
 * touches a container either: the rules are read at every track boundary.
 */
class JingleListController extends Controller
{
    use AuthorizesRequests;

    public function index(Station $station): AnonymousResourceCollection
    {
        $this->authorize('viewAny', [JingleList::class, $station]);

        return JingleListResource::collection($station->jingleLists()->get());
    }

    public function store(JingleListRequest $request, Station $station): JsonResponse
    {
        $this->authorize('create', [JingleList::class, $station]);

        $list = new JingleList(['position' => ((int) $station->jingleLists()->max('position')) + 1]);
        $list->station()->associate($station);
        $this->fill($list, $request);
        $list->save();

        return (new JingleListResource($list->refresh()))->response()->setStatusCode(201);
    }

    public function update(JingleListRequest $request, JingleList $jingleList): JingleListResource
    {
        $this->authorize('update', $jingleList);

        $this->fill($jingleList, $request);
        $jingleList->save();

        return new JingleListResource($jingleList->refresh());
    }

    /**
     * Deletes the list's jingles with it — files and all, as deleting them
     * one by one would. The page says so before it asks.
     */
    public function destroy(JingleList $jingleList, TrackImporter $importer): Response
    {
        $this->authorize('delete', $jingleList);

        $ids = $jingleList->tracks()->pluck('id')->map(fn ($id) => (string) $id)->all();

        if ($ids !== []) {
            $importer->destroyMany($jingleList->station, $ids);
        }

        $jingleList->delete();

        return response()->noContent();
    }

    private function fill(JingleList $list, JingleListRequest $request): void
    {
        $data = $request->validated();

        foreach (['name', 'enabled', 'exact'] as $field) {
            if (array_key_exists($field, $data)) {
                $list->{$field} = $data[$field];
            }
        }

        $rule = $request->ruleAfterSave();
        $list->fill($rule);

        // Clear what the chosen frequency does not use, so the row only
        // ever says one thing. `exact` belongs to set times alone.
        if ($rule['frequency'] !== JingleList::FREQUENCY_MINUTES) {
            $list->every_minutes = null;
        }
        if ($rule['frequency'] !== JingleList::FREQUENCY_SONGS) {
            $list->every_songs = null;
        }
        if ($rule['frequency'] !== JingleList::FREQUENCY_TIMES) {
            $list->times = null;
            $list->exact = false;
        }
        if ($rule['pick'] !== JingleList::PICK_SINGLE) {
            $list->pinned_track_id = null;
        }

        // New set times count from now: a time that passed ten minutes ago
        // should not play the moment it is saved.
        if ($rule['frequency'] === JingleList::FREQUENCY_TIMES && $list->isDirty(['times', 'frequency'])) {
            $list->last_played_at = now()->toImmutable();
        }
    }
}
