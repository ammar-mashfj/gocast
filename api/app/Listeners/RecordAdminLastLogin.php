<?php

namespace App\Listeners;

use App\Models\Admin;
use Illuminate\Auth\Events\Login;

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
