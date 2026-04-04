<?php

namespace App\Policies;

use App\Models\Station;
use App\Models\User;

class StationPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Station $station): bool
    {
        return $user->id === $station->user_id;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Station $station): bool
    {
        return $user->id === $station->user_id;
    }

    public function delete(User $user, Station $station): bool
    {
        return $user->id === $station->user_id;
    }
}
