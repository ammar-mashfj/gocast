<?php

namespace App\Observers;

use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Keeps a user's stations in step with the user row itself.
 *
 * Two unrelated jobs, both of which have to happen the moment the row
 * changes rather than the next time a station starts:
 *
 *  • updated  → a plan change, pushed to the free-tier watermark (below).
 *  • deleting → take the account's stations off air with it, or they outlive
 *               the owner still broadcasting and still publicly listed.
 *
 * On the plan change:
 *
 * Only one thing currently depends on the plan at runtime — the free-tier
 * watermark — and it is the case that matters most to get instant: somebody
 * has just paid to remove "powered by GoCast", and until this runs they can
 * still hear it. Restarting their stations would technically work and would
 * also disconnect every listener they have, mid-show, as their reward for
 * upgrading. So the watermark is an interactive variable in the script and
 * this pushes the new value over telnet instead.
 *
 * The other direction (a downgrade, or an expired subscription) matters too,
 * and takes the same path.
 *
 * Failures are logged, never re-thrown: a Docker or network hiccup must not
 * fail the request that recorded the payment. The rendered script carries the
 * plan's current value as its initial state, so anything missed here is
 * corrected the next time the station starts.
 */
class UserObserver
{
    public function __construct(
        private LiquidsoapSupervisor $supervisor,
    ) {}

    /**
     * Take the account's stations off air along with it.
     *
     * Deleting a user only revokes tokens, anonymises the row and soft-deletes
     * it. None of that reaches the stations: the rows survive, so the
     * containers keep running, the streams keep playing, and the station keeps
     * its place in the public directory with nobody left who can take it down.
     * The station is soft-deleted here rather than stopped, because "stopped"
     * is a state the owner is meant to be able to reverse and there is no
     * owner any more.
     *
     * Deleting each station individually is load-bearing.
     * `$user->stations()->delete()` is a mass delete on the query builder,
     * which fires no model events — StationObserver::deleting would never run
     * and every container would be orphaned, which is the leak this closes.
     */
    public function deleting(User $user): void
    {
        if ($user->isForceDeleting()) {
            // `stations.user_id` is cascadeOnDelete, so the rows are about to
            // disappear at the database level without firing an event —
            // no teardown, and forceDeleted() never runs to wipe the playlist
            // tree and the rendered .liq/HLS artifacts. Doing it here, first,
            // is the only chance to clean those up. Already-trashed stations
            // are included: their files are still on disk.
            foreach ($user->stations()->withTrashed()->get() as $station) {
                $station->forceDelete();
            }

            return;
        }

        // A soft-deleted user keeps its stations recoverable: the files and
        // rows stay, only the containers go. StationObserver::restored brings
        // back whatever was running if the station is ever restored.
        foreach ($user->stations()->get() as $station) {
            $station->delete();
        }
    }

    public function updated(User $user): void
    {
        if (! $user->wasChanged('plan_id')) {
            return;
        }

        // Only running stations have a container to talk to. A stopped one
        // renders the new value into its script whenever it next starts.
        $stations = $user->stations()->running()->get();

        foreach ($stations as $station) {
            // setRelation, not a fresh query: watermarkEnabledFor() walks
            // station -> user -> plan, and the user we already hold is the one
            // carrying the NEW plan. Letting it lazy-load would re-read the
            // row, which is both an extra query per station and a chance to
            // read a stale value inside a transaction.
            $station->setRelation('user', $user);

            try {
                $this->supervisor->applyWatermarkSettings($station);
            } catch (Throwable $e) {
                Log::error('UserObserver: watermark push failed', [
                    'user' => $user->id,
                    'station' => $station->slug,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
