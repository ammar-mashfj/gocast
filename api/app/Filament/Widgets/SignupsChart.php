<?php

namespace App\Filament\Widgets;

use App\Models\User;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

class SignupsChart extends ChartWidget
{
    protected ?string $heading = 'New signups (last 30 days)';

    protected static ?int $sort = 3;

    protected int|string|array $columnSpan = 'full';

    protected function getData(): array
    {
        return Cache::remember('admin.charts.signups', 60, function () {
            $start = now()->subDays(29)->startOfDay();
            $rows = User::selectRaw('DATE(created_at) as day, COUNT(*) as total')
                ->where('created_at', '>=', $start)
                ->groupBy('day')
                ->orderBy('day')
                ->pluck('total', 'day');

            $labels = [];
            $data = [];
            for ($i = 0; $i < 30; $i++) {
                $day = $start->copy()->addDays($i)->toDateString();
                $labels[] = $start->copy()->addDays($i)->format('M j');
                $data[] = (int) ($rows[$day] ?? 0);
            }

            return [
                'datasets' => [
                    [
                        'label' => 'New signups',
                        'data' => $data,
                        'borderColor' => '#f59e0b',
                        'backgroundColor' => '#fde68a',
                        'tension' => 0.3,
                    ],
                ],
                'labels' => $labels,
            ];
        });
    }

    protected function getType(): string
    {
        return 'line';
    }
}
