<?php

namespace App\Http\Controllers;

use App\Http\Resources\StationResource;
use App\Models\Station;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Public endpoints returning station details (no auth required).
 */
class PublicStationController extends Controller
{
    /**
     * Returns featured live stations for the homepage.
     * Only returns stations that are both live and marked as featured.
     * Returns an empty collection when none are live — the frontend hides the section.
     */
    public function featured(): AnonymousResourceCollection
    {
        return StationResource::collection(
            Station::where('is_live', true)
                ->where('featured', true)
                ->limit(4)
                ->get()
        );
    }

    public function show(string $slug): StationResource
    {
        return new StationResource(
            Station::where('slug', $slug)->firstOrFail()
        );
    }
}
