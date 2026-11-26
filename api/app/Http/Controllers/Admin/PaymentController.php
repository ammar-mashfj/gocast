<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CardPaymentInterest;
use App\Models\LavaPayment;
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

        // Card and PayPal payments (lava.top): their own table, filtered the
        // same way, and counted in every total below.
        $cardPayments = LavaPayment::query()
            ->with('user')
            ->when($search !== '', function (Builder $query) use ($search) {
                $query->where(function (Builder $query) use ($search) {
                    $query->where('uuid', $search)
                        ->orWhere('contract_id', $search)
                        ->orWhere('discount_code', $search)
                        ->orWhere('email', 'like', "%{$search}%")
                        ->orWhereHas('user', fn (Builder $user) => $user->withTrashed()->where('email', 'like', "%{$search}%"));
                });
            })
            ->when($filter === 'review', fn (Builder $query) => $query->whereNotNull('review_reason'))
            ->when($filter === 'granted', fn (Builder $query) => $query->whereNotNull('granted_at'))
            ->when($filter === 'open', fn (Builder $query) => $query->where('status', LavaPayment::STATUS_NEW))
            ->latest('id')
            ->paginate(50, pageName: 'card_page')
            ->withQueryString();

        $live = Payment::where('sandbox', false)->whereNotNull('granted_at')
            ->whereNotIn('status', [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED]);
        $cardLive = LavaPayment::whereNotNull('granted_at')
            ->whereNotIn('status', [LavaPayment::STATUS_REFUNDED, LavaPayment::STATUS_CHARGEBACK]);
        $since = now()->subDays(30);
        // Card revenue net of partial refunds (a full one drops the row above).
        $cardNet = fn (Builder $query): float => (float) (clone $query)->sum('amount_usd') - (float) (clone $query)->sum('refunded_usd');

        return view('admin.payments', [
            'payments' => $payments,
            'cardPayments' => $cardPayments,
            'search' => $search,
            'filter' => $filter,
            'needsReview' => Payment::whereNotNull('review_reason')->count() + LavaPayment::whereNotNull('review_reason')->count(),
            'grantedCount' => Payment::where('sandbox', false)->whereNotNull('granted_at')->count() + LavaPayment::whereNotNull('granted_at')->count(),
            'revenueUsd' => (float) (clone $live)->sum('amount_usd') + $cardNet($cardLive),
            'last30Usd' => (float) (clone $live)->where('paid_at', '>=', $since)->sum('amount_usd') + $cardNet((clone $cardLive)->where('paid_at', '>=', $since)),
            'cardRevenueUsd' => $cardNet($cardLive),
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

    public function clearCardReview(LavaPayment $lavaPayment): RedirectResponse
    {
        $lavaPayment->forceFill(['review_reason' => null])->save();

        return back()->with('status', 'Review flag cleared. Nothing about the account was changed.');
    }

    public function clearReview(Payment $payment): RedirectResponse
    {
        $payment->forceFill(['review_reason' => null])->save();

        return back()->with('status', 'Review flag cleared. Nothing about the account was changed.');
    }
}
