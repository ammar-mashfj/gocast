<?php

namespace App\Observers;

use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Carries a plan change through to the audio the user's listeners hear.
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
