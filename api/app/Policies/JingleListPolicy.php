<?php

namespace App\Policies;

use App\Models\JingleList;
use App\Models\Station;
use App\Models\User;

/**
 * Jingle lists belong to stations; ownership flows through, as for
 * playlists. No plan check — see JingleListController.
 */
class JingleListPolicy
{
    public function viewAny(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    public function create(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    public function update(User $user, JingleList $list): bool
    {
        return $this->ownsStation($user, $list->station);
    }

    public function delete(User $user, JingleList $list): bool
    {
        return $this->ownsStation($user, $list->station);
    }

    private function ownsStation(User $user, ?Station $station): bool
    {
        return $station !== null && $station->user_id === $user->id;
    }
}
