@extends('admin.layout')

@section('title', 'Stations')

@section('content')
    <div class="stats mb-6 w-full border border-base-300 bg-base-100 shadow-sm max-sm:stats-vertical">
        <div class="stat">
            <div class="stat-title">Stations</div>
            <div class="stat-value">{{ $totalStations }}</div>
        </div>
        <div class="stat">
            <div class="stat-title">Powered on</div>
            <div class="stat-value">{{ $runningStations }}</div>
            <div class="stat-desc">owner intent, not containers</div>
        </div>
        <div class="stat">
            <div class="stat-title">Live now</div>
            <div class="stat-value">{{ $liveStations }}</div>
            <div class="stat-desc">open broadcast session</div>
        </div>
        <div class="stat">
            <div class="stat-title">Users</div>
            <div class="stat-value">{{ $totalUsers }}</div>
        </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-0">
            <div class="overflow-x-auto">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Station</th>
                            <th>Owner</th>
                            <th>Plan</th>
                            <th>Power</th>
                            <th>Live</th>
                            <th class="text-right">Tracks</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($stations as $station)
                            <tr class="hover:bg-base-200">
                                <td>
                                    <div class="font-medium">{{ $station->name }}</div>
                                    <div class="text-xs opacity-60">{{ $station->slug }}</div>
                                </td>
                                <td class="text-sm">{{ $station->user?->email ?? '—' }}</td>
                                <td>
                                    <span class="badge badge-ghost badge-sm">
                                        {{ $station->user?->plan?->name ?? 'none' }}
                                    </span>
                                </td>
                                <td>
                                    <span @class([
                                        'badge badge-sm',
                                        'badge-success' => $station->isRunning(),
                                        'badge-ghost' => ! $station->isRunning(),
                                    ])>
                                        {{ $station->desired_state }}
                                    </span>
                                </td>
                                <td>
                                    @if ($station->is_live)
                                        <span class="badge badge-error badge-sm">on air</span>
                                    @else
                                        <span class="text-xs opacity-40">—</span>
                                    @endif
                                </td>
                                <td class="text-right tabular-nums">{{ $station->tracks_count }}</td>
                                <td class="text-sm opacity-70">{{ $station->created_at->diffForHumans() }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="py-10 text-center opacity-60">No stations yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    @if ($stations->hasPages())
        <div class="mt-4">{{ $stations->links() }}</div>
    @endif
@endsection
