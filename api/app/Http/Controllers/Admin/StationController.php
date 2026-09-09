<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
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
     * One station's timeline.
     *
     * The list page answers "what exists"; this answers "what happened", which
     * is the question every support conversation actually opens with — a
     * station that was on air last night and is not now, and nobody able to
     * say which of the half-dozen paths to `stopped` it took.
     *
     * Reads only station_events. The station's `activity_log` rows are
     * deliberately NOT merged in: those record edits to settings (a rename, a
     * featuring) and belong to the audit trail, and interleaving two tables
     * with different retention windows would produce a timeline that silently
     * grows holes in one half but not the other.
     */
    public function show(Request $request, Station $station): View
    {
        $type = (string) $request->query('type', '');
        $source = (string) $request->query('source', '');

        $events = $station->events()
            ->when($type !== '', fn ($query) => $query->ofType($type))
            ->when($source !== '', fn ($query) => $query->fromSource($source))
            ->paginate(50)
            ->withQueryString();

        // Eager-loaded rather than resolved from the blade: the header prints
        // the owner's email and plan name, which is two queries per page view
        // hidden behind a `?->`.
        $station->load('user.plan')->loadCount('tracks');

        return view('admin.station', [
            'station' => $station,
            'events' => $events,
            'entries' => $this->collapse($events->getCollection()),
            'type' => $type,
            'source' => $source,
            'types' => StationEvent::TYPES,
            'sources' => StationEvent::SOURCES,
            'isLive' => $station->isLive(),
            // Counted over the window rather than over the page, because the
            // useful version of "is this station flapping?" is a number per
            // day, not a number per fifty rows.
            // reorder() strips the relation's `latest('created_at')`: an ORDER
            // BY on a column that is neither grouped nor aggregated is
            // rejected outright under only_full_group_by, and the ordering
            // here is meaningless anyway — these are counts, not a timeline.
            'lastDay' => $station->events()
                ->reorder()
                ->where('created_at', '>=', now()->subDay())
                ->selectRaw('type, count(*) as total')
                ->groupBy('type')
                ->pluck('total', 'type'),
        ]);
    }

    /**
     * Fold runs of the same event into one row carrying a count.
     *
     * A flapping station reports the same pair a hundred times an hour, and an
     * uncollapsed page of that is fifty identical lines that hide every other
     * event on either side of them. The run is still visible — it is what the
     * count says — but it costs one row instead of the whole screen.
     *
     * Collapsing happens WITHIN A PAGE, so a run spanning a page boundary
     * shows as two rows. Fixing that would mean collapsing in SQL over the
     * whole table to paginate the result, which is a great deal of machinery
     * for a seam nobody reading a timeline is misled by.
     *
     * @param  Collection<int, StationEvent>  $events
     * @return Collection<int, array{event: StationEvent, count: int, until: Carbon|null}>
     */
    private function collapse(Collection $events): Collection
    {
        // A plain array, not a Collection accumulator: `$collection[$i]['count']++`
        // is an indirect modification of an ArrayAccess offset, which PHP
        // refuses.
        $entries = [];

        foreach ($events as $event) {
            $last = array_key_last($entries);

            // Properties are part of the identity: two uploads are two events
            // even though both are `track_uploaded`, because the interesting
            // half of each is the track name.
            $same = $last !== null
                && $entries[$last]['event']->type === $event->type
                && $entries[$last]['event']->source === $event->source
                && $entries[$last]['event']->properties === $event->properties;

            if ($same) {
                $entries[$last]['count']++;
                // Newest first, so the row already holds the LATEST occurrence
                // and each subsequent match pushes the "since" end earlier.
                $entries[$last]['until'] = $event->created_at;

                continue;
            }

            $entries[] = ['event' => $event, 'count' => 1, 'until' => null];
        }

        return new Collection($entries);
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
