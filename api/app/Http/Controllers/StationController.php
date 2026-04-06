<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStationRequest;
use App\Http\Requests\UpdateStationRequest;
use App\Http\Resources\StationResource;
use App\Models\Station;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class StationController extends Controller
{
    use AuthorizesRequests;

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

        $station->load('streamSessions');

        return new StationResource($station);
    }

    public function update(UpdateStationRequest $request, Station $station): StationResource
    {
        $this->authorize('update', $station);

        $station->update($request->validated());

        return new StationResource($station);
    }

    public function destroy(Station $station): JsonResponse
    {
        $this->authorize('delete', $station);

        $station->delete();

        return response()->json(['message' => 'Station deleted.']);
    }
}
