<?php

namespace App\Filament\Widgets;

use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Support\Facades\Cache;

class StatsOverview extends StatsOverviewWidget
{
    protected static ?int $sort = 1;

    protected function getStats(): array
    {
        $data = Cache::remember('admin.stats.overview', 60, function () {
            $now = now();
            $thirty = $now->copy()->subDays(30);
            $sixty = $now->copy()->subDays(60);

            $usersLast30 = User::where('created_at', '>=', $thirty)->count();
            $usersPrev30 = User::whereBetween('created_at', [$sixty, $thirty])->count();

            $totalUsers = User::count();
            $totalStations = Station::count();
            $liveNow = Station::where('is_live', true)->count();

            $listenerMinutes = StreamSession::where('started_at', '>=', $thirty)
                ->sum('total_listener_minutes');
            $listenerHours = intdiv((int) $listenerMinutes, 60);

            return [
                'total_users' => $totalUsers,
                'users_last_30' => $usersLast30,
                'users_prev_30' => $usersPrev30,
                'total_stations' => $totalStations,
                'live_now' => $liveNow,
                'listener_hours' => $listenerHours,
            ];
        });

        $userDelta = $this->percentChange($data['users_last_30'], $data['users_prev_30']);
        $userTrendUp = $data['users_last_30'] >= $data['users_prev_30'];

        return [
            Stat::make('Total users', number_format($data['total_users']))
                ->description($userDelta.' vs prev 30d')
                ->descriptionIcon('heroicon-m-arrow-trending-up')
                ->color($userTrendUp ? 'success' : 'warning'),
            Stat::make('Total stations', number_format($data['total_stations']))
                ->description($data['live_now'].' live right now')
                ->descriptionIcon('heroicon-m-signal'),
            Stat::make('Live right now', (string) $data['live_now'])
                ->color($data['live_now'] > 0 ? 'success' : 'gray'),
            Stat::make('Listener-hours (30d)', number_format($data['listener_hours'])),
        ];
    }

    private function percentChange(int $current, int $previous): string
    {
        if ($previous === 0) {
            return $current > 0 ? '+∞%' : '0%';
        }

        $pct = round((($current - $previous) / $previous) * 100, 1);
        $sign = $pct >= 0 ? '+' : '';

        return $sign.$pct.'%';
    }
}
