<?php

namespace App\Policies;

use App\Models\Admin;
use App\Models\Station;
use App\Models\User;

class StationPolicy
{
    public function viewAny(User|Admin $user): bool
    {
        return true;
    }

    public function view(User|Admin $user, Station $station): bool
    {
        if ($user instanceof Admin) {
            return true;
        }

        return $user->id === $station->user_id;
    }

    public function create(User|Admin $user): bool
    {
        if ($user instanceof Admin) {
            return false;
        }

        return true;
    }

    public function update(User|Admin $user, Station $station): bool
    {
        if ($user instanceof Admin) {
            return true;
        }

        return $user->id === $station->user_id;
    }

    public function delete(User|Admin $user, Station $station): bool
    {
        if ($user instanceof Admin) {
            return true;
        }

        return $user->id === $station->user_id;
    }

    public function restore(User|Admin $user, Station $station): bool
    {
        return $user instanceof Admin;
    }
}
