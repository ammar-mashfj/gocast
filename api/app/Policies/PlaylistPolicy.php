<?php

namespace App\Policies;

use App\Models\Playlist;
use App\Models\Station;
use App\Models\User;

/**
 * Playlists belong to stations; ownership flows through, exactly as it does
 * for tracks. No plan check here — see PlaylistController for why.
 */
class PlaylistPolicy
{
    public function viewAny(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    public function view(User $user, Playlist $playlist): bool
    {
        return $this->ownsStation($user, $playlist->station);
    }

    public function create(User $user, Station $station): bool
    {
        return $this->ownsStation($user, $station);
    }

    public function update(User $user, Playlist $playlist): bool
    {
        return $this->ownsStation($user, $playlist->station);
    }

    public function delete(User $user, Playlist $playlist): bool
    {
        return $this->ownsStation($user, $playlist->station);
    }

    private function ownsStation(User $user, ?Station $station): bool
    {
        return $station !== null && $station->user_id === $user->id;
    }
}
