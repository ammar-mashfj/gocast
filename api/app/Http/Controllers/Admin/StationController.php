<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Station;
use App\Models\User;
use Illuminate\View\View;

/**
 * Read-only station overview for the admin panel.
 *
 * Deliberately queries the models directly rather than going through the API
 * resources: those are shaped for a station's own owner, and this view needs
 * the cross-tenant columns (owner, plan) they intentionally omit.
 */
class StationController extends Controller
{
    public function index(): View
    {
        $stations = Station::query()
            ->with(['user:id,email,plan_id', 'user.plan:id,name'])
            ->withCount('tracks')
            // Live-ness is derived from an open StreamSession, so calling
            // isLive() per row would be one query per station. This resolves
            // the whole page in the same round trip.
            ->withExists(['streamSessions as is_live' => fn ($query) => $query->whereNull('ended_at')])
            ->latest()
            ->paginate(25);

        return view('admin.stations', [
            'stations' => $stations,
            'totalStations' => Station::count(),
            'runningStations' => Station::running()->count(),
            'liveStations' => Station::live()->count(),
            'totalUsers' => User::count(),
        ]);
    }
}
