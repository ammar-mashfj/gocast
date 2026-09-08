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
            <div class="stat-title">Featured</div>
            <div class="stat-value {{ $featuredOnAir === 0 && $featuredStations > 0 ? 'text-warning' : '' }}">
                {{ $featuredStations }}
            </div>
            {{-- Featured is curation; the homepage only renders the on-air ones,
                 up to the rail size. Those are three different numbers and the
                 gap between them is invisible from the public site. --}}
            <div class="stat-desc">
                {{ min($featuredOnAir, $railSize) }} of {{ $railSize }} slots filled
                @if ($featuredOnAir > $railSize)
                    &middot; {{ $featuredOnAir - $railSize }} on air but over the line
                @elseif ($featuredStations > $featuredOnAir)
                    &middot; {{ $featuredStations - $featuredOnAir }} powered off
                @endif
            </div>
        </div>
        <div class="stat">
            <div class="stat-title">Users</div>
            <div class="stat-value">{{ $totalUsers }}</div>
        </div>
    </div>

    <form method="GET" action="{{ route('admin.stations.index') }}" class="mb-4 flex flex-wrap items-end gap-3">
        <label class="floating-label">
            <span>Search</span>
            <input type="search" name="search" value="{{ $search }}" placeholder="Station, slug or owner email"
                   class="input input-sm w-72 max-w-full">
        </label>

        <label class="label cursor-pointer gap-2">
            <input type="checkbox" name="featured" value="1" class="checkbox checkbox-sm" @checked($featuredOnly)>
            <span class="label-text">Featured only</span>
        </label>

        <button type="submit" class="btn btn-sm btn-primary">Filter</button>

        @if ($search !== '' || $featuredOnly)
            <a href="{{ route('admin.stations.index') }}" class="btn btn-ghost btn-sm">Clear</a>
        @endif
    </form>

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
                            <th class="text-right">Featured</th>
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
                                <td class="text-right">
                                    <div class="flex items-center justify-end gap-2">
                                        @if ($station->featured)
                                            {{-- The rail needs the station powered on, so a
                                                 featured-but-stopped pick is worth flagging on
                                                 the row and not only in the flash message. --}}
                                            <span @class([
                                                'badge badge-sm whitespace-nowrap',
                                                'badge-primary' => $station->isRunning(),
                                                'badge-warning badge-outline' => ! $station->isRunning(),
                                            ]) title="{{ $station->featured_at?->toDayDateTimeString() ?? 'featured before this was recorded' }}">
                                                {{ $station->isRunning() ? 'featured' : 'featured · off' }}
                                            </span>
                                        @endif

                                        <form method="POST" action="{{ route('admin.stations.feature', $station) }}">
                                            @csrf
                                            <button type="submit"
                                                    @class([
                                                        'btn btn-xs',
                                                        'btn-ghost' => $station->featured,
                                                        'btn-outline' => ! $station->featured,
                                                    ])
                                                    title="{{ $station->featured ? 'Remove from the homepage rail' : 'Show on the homepage rail while this station is on air' }}">
                                                {{ $station->featured ? 'Unfeature' : 'Feature' }}
                                            </button>
                                        </form>
                                    </div>
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="8" class="py-10 text-center opacity-60">
                                    @if ($featuredOnly)
                                        No stations are featured.
                                    @elseif ($search !== '')
                                        No stations match that search.
                                    @else
                                        No stations yet.
                                    @endif
                                </td>
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
