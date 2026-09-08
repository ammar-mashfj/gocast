<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Station;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * The station overview, and the one thing an admin can change from it:
 * whether a station appears in the curated rail on the homepage.
 *
 * Deliberately queries the models directly rather than going through the API
 * resources: those are shaped for a station's own owner, and this view needs
 * the cross-tenant columns (owner, plan) they intentionally omit.
 */
class StationController extends Controller
{
    public function index(Request $request): View
    {
        $search = trim((string) $request->query('search', ''));

        // Curation is the only reason to come here and act, so it gets a
        // filter. Anything other than "1" means the full list — this is a
        // checkbox in the form, and an absent checkbox posts nothing.
        $featuredOnly = $request->query('featured') === '1';

        $stations = Station::query()
            ->with(['user:id,email,plan_id', 'user.plan:id,name'])
            ->withCount('tracks')
            // Live-ness is derived from an open StreamSession, so calling
            // isLive() per row would be one query per station. This resolves
            // the whole page in the same round trip.
            ->withExists(['streamSessions as is_live' => fn ($query) => $query->whereNull('ended_at')])
            ->when($search !== '', fn ($query) => $query->where(
                fn ($group) => $group
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($owner) => $owner->where('email', 'like', "%{$search}%"))
            ))
            ->when($featuredOnly, fn ($query) => $query->featured())
            ->latest()
            ->paginate(25)
            ->withQueryString();

        return view('admin.stations', [
            'stations' => $stations,
            'search' => $search,
            'featuredOnly' => $featuredOnly,
            'totalStations' => Station::count(),
            'runningStations' => Station::running()->count(),
            'liveStations' => Station::live()->count(),
            'totalUsers' => User::count(),
            // Two numbers, not one. Featuring more stations than the rail has
            // slots is allowed and sometimes deliberate (a pick that is off
            // air today is still a pick), but the gap between "curated" and
            // "actually on the homepage right now" is invisible from the
            // public site and is exactly what someone here needs to see.
            'featuredStations' => Station::featured()->count(),
            'featuredOnAir' => Station::featured()->running()->count(),
            'railSize' => Station::FEATURED_RAIL_SIZE,
        ]);
    }

    /**
     * Put a station in the curated rail, or take it out.
     *
     * Cheap and reversible: `featured` is not one of StationObserver's
     * LIQ_RELEVANT_COLUMNS, so this is a single column write that never
     * touches the station's container. Nothing here caps the number of
     * featured stations — the rail truncates to Station::FEATURED_RAIL_SIZE
     * and the index page says how many are over the line, which is a better
     * answer than a write that fails because somebody else picked first.
     */
    public function feature(Request $request, Station $station): RedirectResponse
    {
        $station->markFeatured(! $station->featured);

        // Model events log the row itself, but LogsActivity resolves its
        // causer off the default guard — which is never the admin guard — so
        // without this the log shows a station being promoted onto the
        // homepage with nobody attached to it.
        activity()
            ->causedBy($request->user('admin'))
            ->performedOn($station)
            ->log($station->featured ? 'featured station' : 'unfeatured station');

        if (! $station->featured) {
            return back()->with('status', "{$station->name} is no longer featured.");
        }

        // Featured but stopped is a legitimate state and not a mistake worth
        // blocking, but it is silent from the homepage's point of view, so it
        // gets said out loud rather than leaving someone refreshing the site
        // wondering where their pick went.
        if (! $station->isRunning()) {
            return back()->with('status', "{$station->name} is featured, but it is powered off — it will only appear on the homepage once its owner starts it.");
        }

        return back()->with('status', "{$station->name} is featured.");
    }
}
