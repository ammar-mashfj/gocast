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
 * Two things depend on the plan at runtime, and both are interactive variables
 * in the rendered script precisely so they can be changed without a restart:
 *
 *   • the free-tier watermark — the case that matters most to get instant.
 *     Somebody has just paid to remove "powered by GoCast", and until this
 *     runs they can still hear it. Restarting their stations would technically
 *     work and would also disconnect every listener they have, mid-show, as
 *     their reward for upgrading.
 *
 *   • the jingle arm — see Station::jinglesAudible(). Unlike the rotation,
 *     which enforces a downgrade by itself (the container asks Laravel for
 *     every track and AutoDjScheduler answers null), jingles play from an m3u
 *     on disk and ask nobody. This push is the only thing that takes them off
 *     air short of a restart.
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

        // The `plan` relation, if the caller had it loaded, is the OLD plan.
        // Eloquent does not drop a loaded belongsTo when its key changes, and
        // plans:expire — the one caller that performs a downgrade
        // automatically — eager-loads it to name the ended plan in the email.
        // Every push below walks station -> user -> plan, so left in place it
        // would send the entitlements of the plan that just ended: jingles
        // kept audible, watermark left off. Unset rather than reloaded so it
        // costs nothing for a caller that never touched it.
        $user->unsetRelation('plan');

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

            // Jingles are gated on the plan too — Station::jinglesAudible().
            // The rotation half of a downgrade enforces itself, because the
            // container asks Laravel for every track and AutoDjScheduler
            // answers null. The jingle half cannot: that arm reads an m3u off
            // disk and asks nobody, so without this push a downgraded station
            // keeps playing station IDs until it is next restarted — which,
            // since a jingle registers on the meter, is long enough for the
            // sweep to keep scoring it `InUse` and never power it down.
            //
            // Separate try, not folded into the one above: losing the
            // watermark push must not also cost the jingle push, and the two
            // failures are worth telling apart in the log.
            try {
                $this->supervisor->applyJingleSettings($station);
            } catch (Throwable $e) {
                Log::error('UserObserver: jingle push failed', [
                    'user' => $user->id,
                    'station' => $station->slug,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
