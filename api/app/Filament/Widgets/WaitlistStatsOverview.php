<?php

namespace App\Filament\Widgets;

use App\Models\WaitlistEntry;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Support\Facades\Cache;

class WaitlistStatsOverview extends StatsOverviewWidget
{
    protected static ?int $sort = 2;

    protected function getStats(): array
    {
        $data = Cache::remember('admin.stats.waitlist', 60, function () {
            $thirty = now()->subDays(30);
            $sixty = now()->subDays(60);

            $total = WaitlistEntry::count();
            $last30 = WaitlistEntry::where('created_at', '>=', $thirty)->count();
            $prev30 = WaitlistEntry::whereBetween('created_at', [$sixty, $thirty])->count();

            $byPlan = WaitlistEntry::selectRaw('plan, count(*) as c')
                ->groupBy('plan')
                ->orderByDesc('c')
                ->pluck('c', 'plan')
                ->all();

            return [
                'total' => $total,
                'last_30' => $last30,
                'prev_30' => $prev30,
                'by_plan' => $byPlan,
            ];
        });

        $breakdown = collect($data['by_plan'])
            ->map(fn ($c, $plan) => ucfirst((string) $plan).': '.$c)
            ->implode(' · ');

        return [
            Stat::make('Waitlist total', number_format($data['total'])),
            Stat::make('Signups (30d)', number_format($data['last_30']))
                ->description($this->percentChange($data['last_30'], $data['prev_30']).' vs prev 30d'),
            Stat::make('By plan', $breakdown ?: '—'),
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
