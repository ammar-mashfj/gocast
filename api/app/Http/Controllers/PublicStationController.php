<?php

namespace App\Http\Controllers;

use App\Http\Resources\StationResource;
use App\Models\Station;

class PublicStationController extends Controller
{
    public function show(string $slug): StationResource
    {
        return new StationResource(
            Station::where('slug', $slug)->firstOrFail()
        );
    }
}
