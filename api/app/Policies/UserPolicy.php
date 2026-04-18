<?php

namespace App\Policies;

use App\Models\Admin;
use App\Models\User;

class UserPolicy
{
    public function viewAny(Admin|User $caller): bool
    {
        return $caller instanceof Admin;
    }

    public function view(Admin|User $caller, User $target): bool
    {
        return $caller instanceof Admin;
    }

    public function create(Admin|User $caller): bool
    {
        return false;
    }

    public function update(Admin|User $caller, User $target): bool
    {
        return $caller instanceof Admin;
    }

    public function delete(Admin|User $caller, User $target): bool
    {
        return $caller instanceof Admin;
    }

    public function restore(Admin|User $caller, User $target): bool
    {
        return $caller instanceof Admin;
    }

    public function forceDelete(Admin|User $caller, User $target): bool
    {
        return false;
    }
}
