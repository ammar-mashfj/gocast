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
     * The admin-curated rail on the homepage and the station page.
     *
     * Requires the station to be ON AIR, not LIVE. Those are different things
     * here: `running()` is the owner having switched the station on, which is
     * what makes the mount exist and a player that connects hear something;
     * `live()` additionally demands an open StreamSession, i.e. a human at a
     * microphone right now. Gating the rail on the latter meant a featured
     * station rotating AutoDJ to a real audience was invisible, and since most
     * stations are not being hand-broadcast at any given minute, the homepage
     * spent most of its life rendering "claim this slot" placeholders instead
     * of the stations someone had deliberately picked. StationResource still
     * reports `is_live` per station, so the cards can badge the difference.
     *
     * Ordering is explicit and total, because the LIMIT truncates: more
     * featured stations than slots and an unordered query is a different four
     * stations per request. Live broadcasts bubble to the top of the rail,
     * then the most recent pick.
     *
     * Returns an empty collection when nothing featured is on air — the
     * frontend falls back to its own empty state.
     */
    public function featured(): AnonymousResourceCollection
    {
        return StationResource::collection(
            Station::query()
                ->featured()
                ->running()
                ->withExists([
                    'streamSessions as has_open_session' => fn ($session) => $session->whereNull('ended_at'),
                ])
                ->orderByDesc('has_open_session')
                // Rows featured before `featured_at` existed and never touched
                // since carry a null, and MySQL sorts those first on a DESC.
                // They belong at the back of the rail, not the front.
                ->orderByRaw('featured_at is null')
                ->orderByDesc('featured_at')
                ->orderBy('name')
                ->limit(Station::FEATURED_RAIL_SIZE)
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
            // Stations that are actually on air rank above ones that are
            // merely configured — a directory full of unstartable stations
            // is worse than a short one.
            //
            // Live-ness is a subquery rather than a column so the sort stays
            // in SQL and the page stays paginated. Deriving it in PHP would
            // mean sorting only within the current page, which puts a live
            // station on page 3 below a silent one on page 1.
            $query->withExists([
                'streamSessions as has_open_session' => fn ($session) => $session->whereNull('ended_at'),
            ])
                ->orderByRaw("desired_state = 'running' desc")
                ->orderByDesc('has_open_session')
                ->orderBy('name');
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
