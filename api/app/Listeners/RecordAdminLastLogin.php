<?php

namespace App\Listeners;

use App\Models\Admin;
use Illuminate\Auth\Events\Login;

/**
 * Mirrors RecordUserLastLogin for the admin guard. Guard-scoped as well as
 * type-scoped so a future guard sharing the model can't write this column
 * by accident.
 */
class RecordAdminLastLogin
{
    public function handle(Login $event): void
    {
        if ($event->guard !== 'admin') {
            return;
        }

        if (! $event->user instanceof Admin) {
            return;
        }

        $event->user->forceFill(['last_login_at' => now()])->save();
    }
}
