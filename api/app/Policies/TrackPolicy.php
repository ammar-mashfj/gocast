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

    public function reorder(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    private function ownsStation(User $user, ?Station $station): bool
    {
        return $station !== null && $station->user_id === $user->id;
    }
}
