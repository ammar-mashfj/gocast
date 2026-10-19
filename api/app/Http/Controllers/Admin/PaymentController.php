<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CardPaymentInterest;
use App\Models\Payment;
use App\Services\Billing\Gateway\GatewayException;
use App\Services\Billing\Gateway\PaymentGateway;
use App\Services\Billing\PaymentProcessor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Every checkout, newest first, with the ones that need a human on top of
 * the filter list.
 *
 * Read-mostly on purpose. The two actions change nothing about the account
 * directly: Recheck asks OxaPay and runs the answer through the same
 * PaymentProcessor as the webhook, and Clear only removes the review flag
 * once the admin has dealt with it (refunded, granted by hand, …).
 */
class PaymentController extends Controller
{
    public function index(Request $request): View
    {
        $search = trim((string) $request->query('search', ''));
        $filter = (string) $request->query('filter', 'all');

        $payments = Payment::query()
            ->with('user')
            ->when($search !== '', function (Builder $query) use ($search) {
                $query->where(function (Builder $query) use ($search) {
                    $query->where('uuid', $search)
                        ->orWhere('track_id', $search)
                        ->orWhere('discount_code', $search)
                        ->orWhereHas('user', fn (Builder $user) => $user->withTrashed()->where('email', 'like', "%{$search}%"));
                });
            })
            ->when($filter === 'review', fn (Builder $query) => $query->whereNotNull('review_reason'))
            ->when($filter === 'granted', fn (Builder $query) => $query->whereNotNull('granted_at'))
            ->when($filter === 'open', fn (Builder $query) => $query->open())
            ->latest('id')
            ->paginate(50)
            ->withQueryString();

        $live = Payment::where('sandbox', false)->whereNotNull('granted_at');

        return view('admin.payments', [
            'payments' => $payments,
            'search' => $search,
            'filter' => $filter,
            'needsReview' => Payment::whereNotNull('review_reason')->count(),
            'grantedCount' => (clone $live)->count(),
            'revenueUsd' => (clone $live)->whereNotIn('status', [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED])->sum('amount_usd'),
            'last30Usd' => (clone $live)->whereNotIn('status', [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED])->where('paid_at', '>=', now()->subDays(30))->sum('amount_usd'),
            'cardInterest' => CardPaymentInterest::latest('id')->get(['email', 'created_at', 'notified_at']),
            'gatewayReady' => filled(config('services.oxapay.merchant_key')),
            'gatewayMode' => config('services.oxapay.driver') === 'fake' ? 'fake' : (config('services.oxapay.sandbox') ? 'sandbox' : 'live'),
        ]);
    }

    public function recheck(Payment $payment, PaymentGateway $gateway, PaymentProcessor $processor): RedirectResponse
    {
        if ($payment->track_id === null) {
            return back()->with('error', 'This payment never got an OxaPay invoice, so there is nothing to ask about.');
        }

        try {
            $processor->process($gateway->paymentInfo($payment->track_id), 'admin');
        } catch (GatewayException $e) {
            return back()->with('error', $e->getMessage());
        }

        $payment->refresh();

        return back()->with('status', "OxaPay says {$payment->status}.".($payment->granted_at ? ' Granted until '.$payment->granted_until?->toFormattedDateString().'.' : ''));
    }

    public function clearReview(Payment $payment): RedirectResponse
    {
        $payment->forceFill(['review_reason' => null])->save();

        return back()->with('status', 'Review flag cleared. Nothing about the account was changed.');
    }
}
