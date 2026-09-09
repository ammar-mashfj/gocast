@extends('admin.layout')

@section('title', $station->name)

@php
    /**
     * Badge colour per event type. Grouped by what the reader is scanning for:
     * red for anything that took a station off air or off Icecast, green for
     * anything that put it back, neutral for the rest. A timeline is read by
     * colour first and words second.
     */
    $tone = [
        \App\Models\StationEvent::TYPE_STARTED => 'badge-success',
        \App\Models\StationEvent::TYPE_STOPPED => 'badge-error',
        \App\Models\StationEvent::TYPE_BOOT => 'badge-info',
        \App\Models\StationEvent::TYPE_SHUTDOWN => 'badge-warning',
        \App\Models\StationEvent::TYPE_ICECAST_CONNECTED => 'badge-success',
        \App\Models\StationEvent::TYPE_ICECAST_DISCONNECTED => 'badge-warning',
        \App\Models\StationEvent::TYPE_ICECAST_ERROR => 'badge-error',
        \App\Models\StationEvent::TYPE_LIVE_CONNECTED => 'badge-primary',
        \App\Models\StationEvent::TYPE_LIVE_DISCONNECTED => 'badge-ghost',
        \App\Models\StationEvent::TYPE_LIVE_SILENT => 'badge-warning',
        \App\Models\StationEvent::TYPE_LIVE_AUDIO => 'badge-success',
        \App\Models\StationEvent::TYPE_TRACK_UPLOADED => 'badge-accent',
        \App\Models\StationEvent::TYPE_TRACK_DELETED => 'badge-ghost',
    ];

    /**
     * Plain-English gloss per type. The raw string is still shown next to it —
     * it is what the container sends and what a log search matches on — but
     * nobody should have to know that "live_disconnected" is the moment AutoDJ
     * took over.
     */
    $gloss = [
        \App\Models\StationEvent::TYPE_STARTED => 'Switched on',
        \App\Models\StationEvent::TYPE_STOPPED => 'Switched off',
        \App\Models\StationEvent::TYPE_BOOT => 'Container came up',
        \App\Models\StationEvent::TYPE_SHUTDOWN => 'Container going down',
        \App\Models\StationEvent::TYPE_ICECAST_CONNECTED => 'On air — Icecast accepted the source',
        \App\Models\StationEvent::TYPE_ICECAST_DISCONNECTED => 'Off air — Icecast source dropped',
        \App\Models\StationEvent::TYPE_ICECAST_ERROR => 'Icecast refused the source',
        \App\Models\StationEvent::TYPE_LIVE_CONNECTED => 'Broadcaster connected — AutoDJ stepped aside',
        \App\Models\StationEvent::TYPE_LIVE_DISCONNECTED => 'Broadcaster left — AutoDJ took over',
        \App\Models\StationEvent::TYPE_LIVE_SILENT => 'Live input went quiet',
        \App\Models\StationEvent::TYPE_LIVE_AUDIO => 'Audio returned on the live input',
        \App\Models\StationEvent::TYPE_TRACK_UPLOADED => 'Track uploaded',
        \App\Models\StationEvent::TYPE_TRACK_DELETED => 'Track deleted',
    ];
@endphp

@section('content')
    <div class="mb-4 flex flex-wrap items-center gap-3">
        <a href="{{ route('admin.stations.index') }}" class="btn btn-ghost btn-sm">&larr; All stations</a>

        <a href="{{ rtrim((string) config('services.frontend_url'), '/') }}/station/{{ $station->slug }}"
           target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
            Open station page
        </a>

        @if ($station->trashed())
            <span class="badge badge-error badge-sm">in trash since {{ $station->deleted_at->toDayDateTimeString() }}</span>
        @endif
    </div>

    <div class="stats mb-6 w-full border border-base-300 bg-base-100 shadow-sm max-sm:stats-vertical">
        <div class="stat">
            <div class="stat-title">Owner</div>
            <div class="stat-value text-lg break-all">{{ $station->user?->email ?? '—' }}</div>
            <div class="stat-desc">{{ $station->user?->plan?->name ?? 'no plan' }}</div>
        </div>
        <div class="stat">
            <div class="stat-title">Power</div>
            <div class="stat-value text-lg">{{ $station->desired_state }}</div>
            <div class="stat-desc">owner intent, not containers</div>
        </div>
        <div class="stat">
            <div class="stat-title">Live</div>
            <div class="stat-value text-lg">{{ $isLive ? 'on air' : 'no' }}</div>
            <div class="stat-desc">open broadcast session</div>
        </div>
        <div class="stat">
            <div class="stat-title">Tracks</div>
            <div class="stat-value text-lg tabular-nums">{{ $station->tracks_count }}</div>
        </div>
        <div class="stat">
            <div class="stat-title">Last ready</div>
            <div class="stat-value text-lg">{{ $station->last_ready_at?->diffForHumans() ?? '—' }}</div>
            <div class="stat-desc">last Icecast accept</div>
        </div>
    </div>

    @if ($lastDay->isNotEmpty())
        {{-- A flapping station is the main thing this page is for, and it is
             far more legible as a count per day than as fifty identical rows
             below. --}}
        <div class="card mb-6 border border-base-300 bg-base-100 shadow-sm">
            <div class="card-body gap-3 p-4">
                <div class="text-sm font-medium opacity-70">Last 24 hours</div>
                <div class="flex flex-wrap gap-2">
                    @foreach ($lastDay as $eventType => $total)
                        <a href="{{ route('admin.stations.show', ['station' => $station, 'type' => $eventType]) }}"
                           class="badge badge-outline gap-1 py-3 {{ $tone[$eventType] ?? '' }}">
                            {{ $gloss[$eventType] ?? $eventType }}
                            <span class="font-semibold tabular-nums">{{ $total }}</span>
                        </a>
                    @endforeach
                </div>
            </div>
        </div>
    @endif

    <form method="GET" action="{{ route('admin.stations.show', $station) }}" class="mb-4 flex flex-wrap items-end gap-3">
        <label class="floating-label">
            <span>Event</span>
            <select name="type" class="select select-sm w-64 max-w-full">
                <option value="">All events</option>
                @foreach ($types as $option)
                    <option value="{{ $option }}" @selected($type === $option)>
                        {{ $gloss[$option] ?? $option }}
                    </option>
                @endforeach
            </select>
        </label>

        <label class="floating-label">
            <span>Source</span>
            <select name="source" class="select select-sm w-40 max-w-full">
                <option value="">Any source</option>
                @foreach ($sources as $option)
                    <option value="{{ $option }}" @selected($source === $option)>{{ $option }}</option>
                @endforeach
            </select>
        </label>

        <button type="submit" class="btn btn-sm btn-primary">Filter</button>

        @if ($type !== '' || $source !== '')
            <a href="{{ route('admin.stations.show', $station) }}" class="btn btn-ghost btn-sm">Clear</a>
        @endif
    </form>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-0">
            <div class="overflow-x-auto">
                <table class="table">
                    <thead>
                        <tr>
                            <th class="w-48">When</th>
                            <th>Event</th>
                            <th class="w-28">Source</th>
                            <th>Detail</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($entries as $entry)
                            @php($event = $entry['event'])
                            <tr class="hover:bg-base-200 align-top">
                                <td class="whitespace-nowrap text-sm">
                                    <div title="{{ $event->created_at?->toDayDateTimeString() }}">
                                        {{ $event->created_at?->diffForHumans() }}
                                    </div>
                                    <div class="text-xs opacity-50">{{ $event->created_at?->format('d M H:i:s') }}</div>
                                    @if ($entry['until'] !== null)
                                        {{-- The run's other end. Without it a "× 40" says how
                                             noisy the station was but not over what stretch,
                                             and forty events in a minute is a different
                                             problem from forty across the night. --}}
                                        <div class="text-xs opacity-50">
                                            back to {{ $entry['until']->format('d M H:i:s') }}
                                        </div>
                                    @endif
                                </td>
                                <td>
                                    <div class="flex flex-wrap items-center gap-2">
                                        <span class="badge badge-sm {{ $tone[$event->type] ?? 'badge-ghost' }}">
                                            {{ $gloss[$event->type] ?? $event->type }}
                                        </span>
                                        @if ($entry['count'] > 1)
                                            <span class="badge badge-neutral badge-sm tabular-nums"
                                                  title="Repeated {{ $entry['count'] }} times in a row">
                                                &times; {{ $entry['count'] }}
                                            </span>
                                        @endif
                                    </div>
                                    <div class="mt-1 font-mono text-xs opacity-50">{{ $event->type }}</div>
                                </td>
                                <td>
                                    <span class="badge badge-ghost badge-sm">{{ $event->source }}</span>
                                    @if ($event->causer_id !== null)
                                        <div class="mt-1 text-xs break-all opacity-60">{{ $event->causerLabel() }}</div>
                                    @endif
                                </td>
                                <td class="text-sm">
                                    @if (filled($event->properties))
                                        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                            @foreach ($event->properties as $key => $value)
                                                <dt class="font-mono text-xs opacity-50">{{ $key }}</dt>
                                                <dd class="break-all">
                                                    {{ is_scalar($value) || $value === null
                                                        ? var_export($value, true)
                                                        : json_encode($value) }}
                                                </dd>
                                            @endforeach
                                        </dl>
                                    @else
                                        <span class="opacity-30">—</span>
                                    @endif
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="4" class="py-10 text-center opacity-60">
                                    @if ($type !== '' || $source !== '')
                                        No events match that filter.
                                    @else
                                        Nothing recorded for this station yet.
                                    @endif
                                </td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    @if ($events->hasPages())
        <div class="mt-4">{{ $events->links() }}</div>
    @endif
@endsection
