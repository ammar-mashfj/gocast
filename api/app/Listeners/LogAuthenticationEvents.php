<?php

namespace App\Listeners;

use App\Models\AuthenticationLog;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Contracts\Auth\Authenticatable;

class LogAuthenticationEvents
{
    public function handleLogin(Login $event): void
    {
        if (! $event->user instanceof Authenticatable) {
            return;
        }

        AuthenticationLog::create([
            'authenticatable_type' => $event->user->getMorphClass(),
            'authenticatable_id' => $event->user->getKey(),
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'login_at' => now(),
            'login_successful' => true,
        ]);
    }

    public function handleFailed(Failed $event): void
    {
        if (! $event->user instanceof Authenticatable) {
            return;
        }

        AuthenticationLog::create([
            'authenticatable_type' => $event->user->getMorphClass(),
            'authenticatable_id' => $event->user->getKey(),
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'login_at' => now(),
            'login_successful' => false,
        ]);
    }

    public function handleLogout(Logout $event): void
    {
        if (! $event->user instanceof Authenticatable) {
            return;
        }

        $log = AuthenticationLog::query()
            ->where('authenticatable_type', $event->user->getMorphClass())
            ->where('authenticatable_id', $event->user->getKey())
            ->whereNotNull('login_at')
            ->whereNull('logout_at')
            ->latest('id')
            ->first();

        if ($log) {
            $log->update(['logout_at' => now()]);

            return;
        }

        AuthenticationLog::create([
            'authenticatable_type' => $event->user->getMorphClass(),
            'authenticatable_id' => $event->user->getKey(),
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'logout_at' => now(),
        ]);
    }
}
