{{-- Card and PayPal payments through lava.top: one row per charge (a pack, a
     membership's first month, or a renewal lava.top made on its own). --}}
<h2 class="mt-8 mb-2 text-lg font-semibold">Card &amp; PayPal (lava.top)</h2>

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
                    @forelse ($cardPayments as $payment)
                        <tr class="hover:bg-base-200 align-top">
                            <td class="whitespace-nowrap text-sm">
                                <div title="{{ $payment->created_at }}">{{ $payment->created_at->diffForHumans() }}</div>
                                <div class="font-mono text-xs opacity-50" title="Payment id">{{ Str::limit($payment->uuid, 8, '') }}</div>
                            </td>
                            <td class="text-sm">
                                @if ($payment->user)
                                    <a href="mailto:{{ $payment->user->email }}" class="link link-hover font-medium">{{ $payment->user->email }}</a>
                                    @if ($payment->user->trashed())
                                        <div class="text-xs opacity-60">deleted account</div>
                                    @endif
                                @elseif ($payment->email !== '')
                                    <span class="text-sm">{{ $payment->email }}</span>
                                    <div class="text-xs opacity-60">no account linked</div>
                                @else
                                    <span class="opacity-40">—</span>
                                @endif
                            </td>
                            <td class="whitespace-nowrap text-sm">
                                {{ $payment->product_name }}
                                <div class="mt-1 flex gap-1">
                                    <span class="badge badge-ghost badge-sm">{{ $payment->method === 'paypal' ? 'PayPal' : 'card' }}</span>
                                    @if ($payment->kind !== 'pack')
                                        <span class="badge badge-ghost badge-sm">{{ $payment->kind === 'renewal' ? 'renewal' : 'monthly' }}</span>
                                    @endif
                                </div>
                            </td>
                            <td class="whitespace-nowrap text-sm">
                                <div class="font-medium">${{ $payment->amount_usd }}</div>
                                @if ((float) $payment->refunded_usd > 0 && $payment->status !== 'refunded')
                                    <div class="text-xs opacity-60">−${{ $payment->refunded_usd }} refunded</div>
                                @endif
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
                                    'badge-success' => $payment->granted_at && ! in_array($payment->status, ['refunded', 'chargeback'], true),
                                    'badge-warning' => $payment->review_reason !== null,
                                    'badge-ghost' => ! $payment->granted_at && $payment->review_reason === null,
                                ])>{{ $payment->status }}</span>
                                @if ($payment->review_reason)
                                    <div class="mt-1 max-w-xs text-xs text-warning">{{ $payment->review_reason }}</div>
                                @elseif ($payment->failureReason())
                                    <div class="mt-1 max-w-xs text-xs opacity-60">{{ $payment->failureReason() }}</div>
                                @endif
                                @if ($payment->contract_id)
                                    <div class="mt-1 font-mono text-xs opacity-50" title="lava.top contract id">{{ $payment->contract_id }}</div>
                                @endif
                            </td>
                            <td class="whitespace-nowrap text-sm">
                                {{ $payment->granted_until?->toFormattedDateString() ?? '—' }}
                            </td>
                            <td class="text-right">
                                @if ($payment->review_reason)
                                    <form method="POST" action="{{ route('admin.card-payments.clear-review', $payment) }}">
                                        @csrf
                                        <button type="submit" class="btn btn-ghost btn-xs" title="You've dealt with it. Changes nothing about the account.">Clear</button>
                                    </form>
                                @endif
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="7" class="py-10 text-center opacity-60">
                                {{ $search !== '' || $filter !== 'all' ? 'No card payments match.' : 'No card payments yet.' }}
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</div>

@if ($cardPayments->hasPages())
    <div class="mt-4">{{ $cardPayments->links() }}</div>
@endif
