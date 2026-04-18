<?php

namespace App\Console\Commands;

use App\Models\Admin;
use App\Models\AuthenticationLog;
use App\Notifications\AdminLoginAbuseDetected;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

class DetectAdminLoginAbuseCommand extends Command
{
    protected $signature = 'admin:detect-login-abuse';

    protected $description = 'Alert when any IP exceeds the admin login-failure threshold in the last hour.';

    private const THRESHOLD = 10;

    public function handle(): int
    {
        $since = now()->subHour();

        $offenders = AuthenticationLog::query()
            ->where('authenticatable_type', 'admin')
            ->where('login_successful', false)
            ->where('login_at', '>=', $since)
            ->selectRaw('ip_address, COUNT(*) as attempts')
            ->groupBy('ip_address')
            ->having('attempts', '>', self::THRESHOLD)
            ->get();

        if ($offenders->isEmpty()) {
            return self::SUCCESS;
        }

        $admins = Admin::all();

        foreach ($offenders as $offender) {
            Log::critical('Admin login abuse detected', [
                'ip' => $offender->ip_address,
                'attempts' => (int) $offender->attempts,
                'since' => $since->toIso8601String(),
            ]);

            Notification::send(
                $admins,
                new AdminLoginAbuseDetected((string) $offender->ip_address, (int) $offender->attempts),
            );
        }

        return self::SUCCESS;
    }
}
