<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What link would this name get? The create page asks as the owner types,
 * so they see their address before pressing Create rather than on the
 * overview after. The link is read-only: it is built from the name, and
 * only the name, by the same method creating uses (Station::slugFor), so
 * a taken name shows its -2 here and gets its -2 there.
 */
class StationSlugController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        // Same bound as StoreStationRequest: a longer name would be refused on
        // create, so there is no link to preview for it. `string` keeps an
        // array (`?name[]=`) a 422 rather than a cast warning.
        $validated = $request->validate(['name' => ['nullable', 'string', 'max:100']]);
        $name = trim($validated['name'] ?? '');

        return response()->json([
            'data' => [
                'name' => $name,
                'slug' => $name === '' ? null : Station::slugFor($name),
            ],
        ]);
    }
}
