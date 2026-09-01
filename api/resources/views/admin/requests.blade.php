@extends('admin.layout')

@section('title', 'Access requests')

@section('content')
    <div class="stats mb-6 w-full border border-base-300 bg-base-100 shadow-sm max-sm:stats-vertical">
        <div class="stat">
            <div class="stat-title">Pending</div>
            <div class="stat-value {{ $pendingEntries > 0 ? 'text-warning' : '' }}">{{ $pendingEntries }}</div>
            <div class="stat-desc">waiting on a decision</div>
        </div>
        <div class="stat">
            <div class="stat-title">Requests</div>
            <div class="stat-value">{{ $totalEntries }}</div>
        </div>
        <div class="stat">
            <div class="stat-title">Last 7 days</div>
            <div class="stat-value">{{ $recentEntries }}</div>
        </div>
        <div class="stat">
            <div class="stat-title">Unique emails</div>
            <div class="stat-value">{{ $uniqueEmails }}</div>
            <div class="stat-desc">one row per plan requested</div>
        </div>
        <div class="stat">
            <div class="stat-title">From accounts</div>
            <div class="stat-value">{{ $fromAccounts }}</div>
            <div class="stat-desc">grantable; the rest are enquiries</div>
        </div>
    </div>

    <form method="GET" action="{{ route('admin.requests.index') }}" class="mb-4 flex flex-wrap items-end gap-2">
        <label class="floating-label">
            <span>Search</span>
            <input type="search" name="search" value="{{ $search }}" placeholder="Email, social or message"
                   class="input input-sm w-64 max-w-full">
        </label>

        {{-- Defaults to pending, so the page opens as a work queue. The other
             options are for looking something up after the fact. --}}
        <label class="floating-label">
            <span>Status</span>
            <select name="status" class="select select-sm">
                <option value="pending" @selected($status === 'pending')>Pending</option>
                <option value="approved" @selected($status === 'approved')>Approved</option>
                <option value="rejected" @selected($status === 'rejected')>Dismissed</option>
                <option value="all" @selected($status === 'all')>All</option>
            </select>
        </label>

        @if ($plans->count() > 1)
            <label class="floating-label">
                <span>Plan</span>
                <select name="plan" class="select select-sm">
                    <option value="">All plans</option>
                    @foreach ($plans as $option)
                        <option value="{{ $option }}" @selected($plan === $option)>{{ $option }}</option>
                    @endforeach
                </select>
            </label>
        @endif

        <button type="submit" class="btn btn-sm btn-primary">Filter</button>

        @if ($search !== '' || $plan !== '' || $status !== 'pending')
            <a href="{{ route('admin.requests.index') }}" class="btn btn-ghost btn-sm">Clear</a>
        @endif
    </form>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-0">
            <div class="overflow-x-auto">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Account</th>
                            <th>Plan</th>
                            <th>Social</th>
                            <th>Message</th>
                            <th>Requested</th>
                            <th class="text-right">Review</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($entries as $entry)
                            {{-- A request naming a plan with no row in `plans` can never be
                                 granted. Said on the row rather than after the click. --}}
                            @php($known = in_array($entry->plan, $grantablePlans, true))
                            <tr class="hover:bg-base-200 align-top">
                                <td>
                                    <a href="mailto:{{ $entry->email }}" class="link link-hover font-medium">
                                        {{ $entry->email }}
                                    </a>
                                </td>
                                <td class="whitespace-nowrap text-sm">
                                    {{-- Pro requests are authenticated, so this is the station
                                         owner to open before granting. Custom enquiries are
                                         public and have nobody behind them yet. --}}
                                    @if ($entry->user)
                                        <div>{{ $entry->user->name }}</div>
                                        <div class="text-xs opacity-60">
                                            {{ $entry->user->stations_count }} {{ Str::plural('station', $entry->user->stations_count) }}
                                            &middot; {{ $entry->user->plan?->name ?? 'Free' }}
                                        </div>
                                    @elseif ($entry->user_id)
                                        {{-- The FK survives a soft delete, so this is a closed
                                             account rather than a public enquiry. --}}
                                        <span class="text-xs opacity-60" title="Account deleted">deleted account</span>
                                    @else
                                        <span class="opacity-40" title="Public enquiry — no account">—</span>
                                    @endif
                                </td>
                                <td class="whitespace-nowrap">
                                    <span class="badge badge-ghost badge-sm">{{ $entry->plan }}</span>
                                    @unless ($known)
                                        <div class="mt-1 text-xs text-warning" title="No row in the plans table with this slug">
                                            unknown plan
                                        </div>
                                    @endunless
                                    <div class="mt-1">
                                        @switch ($entry->status)
                                            @case (\App\Models\WaitlistEntry::STATUS_APPROVED)
                                                <span class="badge badge-success badge-sm">approved</span>
                                                @break
                                            @case (\App\Models\WaitlistEntry::STATUS_REJECTED)
                                                <span class="badge badge-outline badge-sm opacity-60">dismissed</span>
                                                @break
                                            @default
                                                <span class="badge badge-warning badge-sm">pending</span>
                                        @endswitch
                                    </div>
                                    @if ($entry->reviewed_at)
                                        <div class="mt-1 text-xs opacity-60"
                                             title="{{ $entry->reviewed_at->toDayDateTimeString() }}">
                                            by {{ $entry->reviewer?->name ?? 'a removed admin' }},
                                            {{ $entry->reviewed_at->diffForHumans() }}
                                        </div>
                                    @endif
                                </td>
                                <td class="text-sm">
                                    @if ($entry->social)
                                        {{-- Handles ("@myshow") are as common here as links, and only a
                                             link is safe to make clickable. --}}
                                        @if (str_contains($entry->social, '.') && ! str_contains($entry->social, ' '))
                                            <a href="{{ str_starts_with($entry->social, 'http') ? $entry->social : 'https://'.$entry->social }}"
                                               target="_blank" rel="noopener noreferrer nofollow"
                                               class="link link-hover">{{ $entry->social }}</a>
                                        @else
                                            {{ $entry->social }}
                                        @endif
                                    @else
                                        <span class="opacity-40">—</span>
                                    @endif
                                </td>
                                <td class="max-w-md whitespace-pre-line text-sm opacity-80">
                                    {{ $entry->message ?: '—' }}
                                </td>
                                <td class="whitespace-nowrap text-sm opacity-70"
                                    title="{{ $entry->created_at->toDayDateTimeString() }}">
                                    {{ $entry->created_at->diffForHumans() }}
                                    {{-- A resubmit updates the row in place, so an updated_at
                                         later than created_at means they revised their answers. --}}
                                    @if ($entry->updated_at->gt($entry->created_at))
                                        <div class="text-xs opacity-60"
                                             title="{{ $entry->updated_at->toDayDateTimeString() }}">
                                            resubmitted {{ $entry->updated_at->diffForHumans() }}
                                        </div>
                                    @endif
                                </td>
                                <td class="text-right">
                                    <div class="flex justify-end gap-1">
                                        @if ($entry->status === \App\Models\WaitlistEntry::STATUS_APPROVED)
                                            <form method="POST" action="{{ route('admin.requests.revoke', $entry) }}"
                                                  onsubmit="return confirm('Move {{ $entry->email }} back to Free? They lose AutoDJ and drop to the free listener cap.')">
                                                @csrf
                                                <button type="submit" class="btn btn-ghost btn-xs">Revoke</button>
                                            </form>
                                        @elseif ($entry->status === \App\Models\WaitlistEntry::STATUS_REJECTED)
                                            <form method="POST" action="{{ route('admin.requests.reopen', $entry) }}">
                                                @csrf
                                                <button type="submit" class="btn btn-ghost btn-xs">Reopen</button>
                                            </form>
                                        @else
                                            {{-- Approve exists only where there is an account to move
                                                 onto a plan. A Custom enquiry from a stranger is
                                                 answered by email and dismissed. --}}
                                            @if ($entry->user)
                                                <form method="POST" action="{{ route('admin.requests.approve', $entry) }}"
                                                      onsubmit="return confirm('Put {{ $entry->email }} on {{ $entry->plan }}? They will be emailed.')">
                                                    @csrf
                                                    <button type="submit" class="btn btn-primary btn-xs"
                                                            @disabled(! $known)
                                                            title="{{ $known ? 'Grant this plan and email them' : 'No plan is configured with this slug' }}">
                                                        Approve
                                                    </button>
                                                </form>
                                            @endif
                                            <form method="POST" action="{{ route('admin.requests.dismiss', $entry) }}">
                                                @csrf
                                                <button type="submit" class="btn btn-ghost btn-xs"
                                                        title="Hide from the queue. Nothing is sent to them.">
                                                    Dismiss
                                                </button>
                                            </form>
                                        @endif
                                    </div>
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="py-10 text-center opacity-60">{{ $emptyMessage }}</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    @if ($entries->hasPages())
        <div class="mt-4">{{ $entries->links() }}</div>
    @endif
@endsection
