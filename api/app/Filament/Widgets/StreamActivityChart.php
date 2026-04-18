<?php

namespace App\Filament\Widgets;

use App\Models\StreamSession;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

class StreamActivityChart extends ChartWidget
{
    protected ?string $heading = 'Broadcast minutes (last 30 days, by source)';

    protected static ?int $sort = 4;

    protected int|string|array $columnSpan = 'full';

    protected function getData(): array
    {
        return Cache::remember('admin.charts.stream_activity', 60, function () {
            $start = now()->subDays(29)->startOfDay();

            // MySQL-specific: TIMESTAMPDIFF. Safe in prod; we're MySQL-only.
            $rows = StreamSession::selectRaw('DATE(started_at) as day, source_type, SUM(TIMESTAMPDIFF(MINUTE, started_at, COALESCE(ended_at, NOW()))) as mins')
                ->where('started_at', '>=', $start)
                ->groupBy('day', 'source_type')
                ->get();

            $sources = ['browser', 'electron', 'external'];
            $series = array_fill_keys($sources, array_fill(0, 30, 0));
            $labels = [];

            for ($i = 0; $i < 30; $i++) {
                $labels[] = $start->copy()->addDays($i)->format('M j');
            }

            foreach ($rows as $row) {
                $dayIndex = (int) $start->diffInDays($row->day);
                if ($dayIndex < 0 || $dayIndex > 29) {
                    continue;
                }
                $series[$row->source_type][$dayIndex] = (int) $row->mins;
            }

            $colors = [
                'browser' => '#f59e0b',
                'electron' => '#8b5cf6',
                'external' => '#10b981',
            ];

            return [
                'datasets' => array_map(fn ($s) => [
                    'label' => ucfirst($s),
                    'data' => $series[$s],
                    'backgroundColor' => $colors[$s],
                    'stack' => 'stream',
                ], $sources),
                'labels' => $labels,
            ];
        });
    }

    protected function getType(): string
    {
        return 'bar';
    }

    protected function getOptions(): array
    {
        return [
            'scales' => [
                'x' => ['stacked' => true],
                'y' => ['stacked' => true],
            ],
        ];
    }
}
