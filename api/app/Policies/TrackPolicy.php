<?php

namespace App\Policies;

use App\Models\Station;
use App\Models\Track;
use App\Models\User;

/**
 * Tracks belong to stations; ownership flows through. A user can only
 * touch a track if they own its station.
 */
class TrackPolicy
{
    public function viewAny(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    public function view(User $user, Track $track): bool
    {
        return $this->ownsStation($user, $track->station);
    }

    public function create(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    public function update(User $user, Track $track): bool
    {
        return $this->ownsStation($user, $track->station);
    }

    public function delete(User $user, Track $track): bool
    {
        return $this->ownsStation($user, $track->station);
    }

    /**
     * Delete several of a station's tracks at once.
     *
     * Station-scoped rather than track-scoped because the request names the
     * station and the IDs are validated against it; `delete` above still
     * guards the single-track route. The two must stay in step — anything
     * that can be deleted one at a time can be deleted in a batch.
     */
    public function deleteAny(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    public function reorder(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    private function ownsStation(User $user, ?Station $station): bool
    {
        return $station !== null && $station->user_id === $user->id;
    }
}
