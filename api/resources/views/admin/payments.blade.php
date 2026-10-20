@extends('admin.layout')

@section('title', 'Payments')

@section('content')
    @unless ($gatewayReady)
        <div role="alert" class="alert alert-warning alert-soft mb-6">
            <span>OXAPAY_MERCHANT_KEY is blank, so checkout and the webhook are both refusing. Nobody can pay until it is set.</span>
        </div>
    @endunless

    <div class="stats mb-6 w-full border border-base-300 bg-base-100 shadow-sm max-sm:stats-vertical">
        <div class="stat">
            <div class="stat-title">Needs review</div>
            <div class="stat-value {{ $needsReview > 0 ? 'text-warning' : '' }}">{{ $needsReview }}</div>
            <div class="stat-desc">underpaid, refunded, or paid but not granted</div>
        </div>
        <div class="stat">
            <div class="stat-title">Paid &amp; granted</div>
            <div class="stat-value">{{ $grantedCount }}</div>
            <div class="stat-desc">real money only</div>
        </div>
        <div class="stat">
            <div class="stat-title">Revenue</div>
            <div class="stat-value">${{ number_format((float) $revenueUsd, 2) }}</div>
            <div class="stat-desc">${{ number_format((float) $last30Usd, 2) }} in the last 30 days, before OxaPay's fee</div>
        </div>
        <div class="stat">
            <div class="stat-title">Want card payments</div>
            <div class="stat-value">{{ $cardInterest->count() }}</div>
            <div class="stat-desc">pressed "Notify me" in Get Pro</div>
        </div>
        <div class="stat">
            <div class="stat-title">Gateway</div>
            <div class="stat-value text-2xl">{{ $gatewayMode }}</div>
            <div class="stat-desc">from OXAPAY_DRIVER / OXAPAY_SANDBOX</div>
        </div>
    </div>

    <form method="GET" action="{{ route('admin.payments.index') }}" class="mb-4 flex flex-wrap items-end gap-2">
        <label class="floating-label">
            <span>Search</span>
            <input type="search" name="search" value="{{ $search }}" placeholder="Email, coupon, payment id or track id"
                   class="input input-sm w-72 max-w-full">
        </label>
        <label class="floating-label">
            <span>Show</span>
            <select name="filter" class="select select-sm">
                <option value="all" @selected($filter === 'all')>All</option>
                <option value="review" @selected($filter === 'review')>Needs review</option>
                <option value="granted" @selected($filter === 'granted')>Granted</option>
                <option value="open" @selected($filter === 'open')>Not paid yet</option>
            </select>
        </label>
        <button type="submit" class="btn btn-sm btn-primary">Filter</button>
        @if ($search !== '' || $filter !== 'all')
            <a href="{{ route('admin.payments.index') }}" class="btn btn-ghost btn-sm">Clear</a>
        @endif
    </form>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body p-0">
            <div class="overflow-x-auto">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Started</th>
                            <th>Account</th>
                            <th>Product</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Granted until</th>
                            <th class="text-right"></th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($payments as $payment)
                            <tr class="hover:bg-base-200 align-top">
                                <td class="whitespace-nowrap text-sm">
                                    <div title="{{ $payment->created_at }}">{{ $payment->created_at->diffForHumans() }}</div>
                                    <div class="font-mono text-xs opacity-50" title="Payment id (OxaPay order id)">{{ Str::limit($payment->uuid, 8, '') }}</div>
                                </td>
                                <td class="text-sm">
                                    @if ($payment->user)
                                        <a href="mailto:{{ $payment->user->email }}" class="link link-hover font-medium">{{ $payment->user->email }}</a>
                                        @if ($payment->user->trashed())
                                            <div class="text-xs opacity-60">deleted account</div>
                                        @endif
                                    @else
                                        <span class="opacity-40">—</span>
                                    @endif
                                </td>
                                <td class="whitespace-nowrap text-sm">
                                    {{ $payment->product_name }}
                                    @if ($payment->sandbox)
                                        <span class="badge badge-ghost badge-sm">test</span>
                                    @endif
                                </td>
                                <td class="whitespace-nowrap text-sm">
                                    <div class="font-medium">${{ $payment->amount_usd }}</div>
                                    @if ((float) $payment->discount_usd > 0)
                                        <div class="text-xs opacity-60">
                                            <s>${{ $payment->list_price_usd }}</s>
                                            {{ $payment->discount_code ? '· '.$payment->discount_code : '· sale' }}
                                        </div>
                                    @endif
                                </td>
                                <td class="text-sm">
                                    <span @class([
                                        'badge badge-sm',
                                        'badge-success' => $payment->granted_at && ! in_array($payment->status, ['refunding', 'refunded'], true),
                                        'badge-warning' => $payment->review_reason !== null,
                                        'badge-ghost' => ! $payment->granted_at && $payment->review_reason === null,
                                    ])>{{ str_replace('_', ' ', $payment->status) }}</span>
                                    @if ($payment->review_reason)
                                        <div class="mt-1 max-w-xs text-xs text-warning">{{ $payment->review_reason }}</div>
                                    @endif
                                    @if ($payment->track_id)
                                        <div class="mt-1 font-mono text-xs opacity-50" title="OxaPay track id">{{ $payment->track_id }}</div>
                                    @endif
                                </td>
                                <td class="whitespace-nowrap text-sm">
                                    {{ $payment->granted_until?->toFormattedDateString() ?? '—' }}
                                </td>
                                <td class="text-right">
                                    <div class="flex justify-end gap-1">
                                        @if ($payment->track_id)
                                            <form method="POST" action="{{ route('admin.payments.recheck', $payment) }}">
                                                @csrf
                                                <button type="submit" class="btn btn-ghost btn-xs" title="Ask OxaPay for this invoice's status and apply it, exactly as the webhook would.">Recheck</button>
                                            </form>
                                        @endif
                                        @if ($payment->review_reason)
                                            <form method="POST" action="{{ route('admin.payments.clear-review', $payment) }}">
                                                @csrf
                                                <button type="submit" class="btn btn-ghost btn-xs" title="You've dealt with it. Changes nothing about the account.">Clear</button>
                                            </form>
                                        @endif
                                    </div>
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="py-10 text-center opacity-60">
                                    {{ $search !== '' || $filter !== 'all' ? 'No payments match.' : 'No payments yet.' }}
                                </td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    @if ($payments->hasPages())
        <div class="mt-4">{{ $payments->links() }}</div>
    @endif

    @if ($cardInterest->isNotEmpty())
        <details class="collapse-arrow collapse mt-6 border border-base-300 bg-base-100">
            <summary class="collapse-title font-medium">Card payments waitlist ({{ $cardInterest->count() }})</summary>
            <div class="collapse-content">
                <textarea readonly rows="{{ min(10, $cardInterest->count()) }}" id="card-emails"
                          class="textarea w-full font-mono text-sm">{{ $cardInterest->pluck('email')->implode("\n") }}</textarea>
                <button type="button" class="btn btn-sm mt-2" data-copy="#card-emails">Copy emails</button>
            </div>
        </details>
        @include('admin.partials.copy-script')
    @endif
@endsection
