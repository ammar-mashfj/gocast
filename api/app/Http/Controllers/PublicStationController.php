<?php

namespace App\Http\Controllers;

use App\Http\Resources\StationResource;
use App\Models\Station;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Pagination\LengthAwarePaginator;

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

    /**
     * Public directory — searchable + filterable + paginated.
     *
     * Sort modes:
     *  - live (default): live stations first, then by name
     *  - new: newest stations first
     */
    public function index(Request $request): AnonymousResourceCollection|LengthAwarePaginator
    {
        $query = Station::query();

        if ($search = trim((string) $request->query('q', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        if ($genre = trim((string) $request->query('genre', ''))) {
            $query->where('genre', $genre);
        }

        $sort = $request->query('sort', 'live');
        if ($sort === 'new') {
            $query->orderByDesc('created_at');
        } else {
            $query->orderByDesc('is_live')->orderBy('name');
        }

        return StationResource::collection($query->paginate(24));
    }

    /**
     * Distinct list of genres in use, for the directory filter dropdown.
     *
     * @return array{data: array<int, string>}
     */
    public function genres(): array
    {
        $genres = Station::query()
            ->whereNotNull('genre')
            ->where('genre', '!=', '')
            ->distinct()
            ->orderBy('genre')
            ->pluck('genre')
            ->values();

        return ['data' => $genres->all()];
    }
}
