<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStationRequest;
use App\Http\Requests\UpdateStationRequest;
use App\Http\Resources\StationResource;
use App\Models\Station;
use App\Services\StationLifecycleService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * CRUD operations for user-owned radio stations.
 */
class StationController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly StationLifecycleService $lifecycle,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        return StationResource::collection($request->user()->stations);
    }

    public function store(StoreStationRequest $request): JsonResponse
    {
        $station = $request->user()->stations()->create($request->validated());

        return (new StationResource($station->refresh()))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Station $station): StationResource
    {
        $this->authorize('view', $station);

        $station->load(['streamSessions', 'schedules', 'autodjSlots.playlist', 'defaultPlaylist']);

        // The one owner-facing fetch behind a page that has somewhere to put
        // the stream key — the settings card. index() deliberately does not
        // ask: see StationResource::$withEncoder.
        return (new StationResource($station))->withEncoder();
    }

    public function update(UpdateStationRequest $request, Station $station): StationResource
    {
        $this->authorize('update', $station);

        $data = $request->validated();

        // Jingles are part of AutoDJ — they only ever play between rotation
        // tracks, so switching them on without it stores a setting that can
        // never fire. Gated on the same flag as uploading, and only in the
        // "on" direction: a downgraded owner must still be able to turn the
        // feature off, and the rest of this payload (name, artwork, socials)
        // stays open on every plan.
        if (($data['jingles_enabled'] ?? false) === true && ! $station->jingles_enabled) {
            $this->lifecycle->assertAutoDjEnabled($request->user());
        }

        // Crossfade only shapes AutoDJ: a station without it would store a
        // setting that can never be heard. Unlike jingles, gated both ways:
        // turning it off silences nothing, so there is no reason to let a
        // downgraded owner change it.
        if (array_key_exists('crossfade_enabled', $data) && (bool) $data['crossfade_enabled'] !== (bool) $station->crossfade_enabled) {
            $this->lifecycle->assertAutoDjEnabled($request->user());
        }

        // Sorted and deduplicated so the settings card reads them back in
        // order and JingleClock can walk them as a clock face.
        if (isset($data['jingle_times'])) {
            $data['jingle_times'] = collect($data['jingle_times'])->map(fn ($minute) => (int) $minute)->unique()->sort()->values()->all();
        }

        $station->update($data);

        // With the slots, so the reply carries `programme` resolved in the
        // (possibly new) timezone: the Schedule page rebuilds its "Right now"
        // card from this after a timezone save, and without them the key was
        // simply absent and the card fell back to the default playlist.
        $station->load(['autodjSlots.playlist', 'defaultPlaylist']);

        return new StationResource($station);
    }

    public function destroy(Station $station): JsonResponse
    {
        $this->authorize('delete', $station);

        $station->delete();

        return response()->json(['message' => 'Station deleted.']);
    }
}
