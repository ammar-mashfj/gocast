<?php

namespace App\Http\Controllers;

use App\Models\CardPaymentInterest;
use App\Models\Payment;
use App\Models\Product;
use App\Services\Billing\Checkout;
use App\Services\Billing\CheckoutRefused;
use App\Services\Billing\Pricing;
use App\Services\Billing\Quote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Self-serve checkout for the dashboard's Get Pro dialog.
 *
 * - catalog(): what is for sale and what it costs today (public — the
 *   homepage pricing section reads it too).
 * - quote(): the same, for one product with a coupon.
 * - checkout(): records the purchase and returns OxaPay's payment page.
 * - show(): how far one of the buyer's payments has got, polled by the
 *   account page after OxaPay sends them back.
 * - cardInterest() / notifyCards(): the "card payments are coming soon —
 *   notify me" line in the dialog.
 *
 * Prices are never taken from the request; see Checkout.
 */
class BillingController extends Controller
{
    public function catalog(Pricing $pricing): JsonResponse
    {
        $products = Product::listed()->with('plan')->get()
            ->map(fn (Product $product) => $this->present($pricing->quote($product)));

        return response()->json(['data' => $products->values()]);
    }

    public function quote(Request $request, Pricing $pricing): JsonResponse
    {
        $data = $request->validate([
            'product' => ['required', 'string', 'max:60'],
            'code' => ['nullable', 'string', 'max:60'],
        ]);

        $product = Product::active()->with('plan')->where('slug', $data['product'])->first();

        if ($product === null) {
            return response()->json(['message' => 'That plan is not for sale any more.'], 404);
        }

        return response()->json(['data' => $this->present($pricing->quote($product, $data['code'] ?? null, $request->user()))]);
    }

    public function checkout(Request $request, Checkout $checkout): JsonResponse
    {
        $data = $request->validate([
            'product' => ['required', 'string', 'max:60'],
            'code' => ['nullable', 'string', 'max:60'],
        ]);

        try {
            $payment = $checkout->start($request->user(), $data['product'], $data['code'] ?? null);
        } catch (CheckoutRefused $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }

        return response()->json(['data' => [
            'payment' => $payment->uuid,
            'payment_url' => $payment->payment_url,
        ]], 201);
    }

    public function show(Request $request, Payment $payment): JsonResponse
    {
        // 404, not 403: whether somebody else's payment id exists is not
        // something to confirm.
        abort_unless($payment->user_id === $request->user()->id, 404);

        return response()->json(['data' => [
            'payment' => $payment->uuid,
            'state' => $this->state($payment),
            'product_name' => $payment->product_name,
            'amount_usd' => $payment->amount_usd,
            'granted_until' => $payment->granted_until?->toIso8601String(),
            'payment_url' => $this->state($payment) === 'pending' ? $payment->payment_url : null,
        ]]);
    }

    /** Whether this account has already asked to hear about card payments. */
    public function cardInterest(Request $request): JsonResponse
    {
        return response()->json(['data' => [
            'subscribed' => CardPaymentInterest::where('user_id', $request->user()->id)->exists(),
        ]]);
    }

    /** "Notify me": idempotent, one row per account. */
    public function notifyCards(Request $request): JsonResponse
    {
        $user = $request->user();

        CardPaymentInterest::firstOrCreate(['user_id' => $user->id], ['email' => $user->email]);

        return response()->json(['data' => ['subscribed' => true]]);
    }

    /**
     * What the buyer should be told, collapsed from OxaPay's nine statuses:
     * pending (not paid yet), confirming (sent, waiting on the chain),
     * granted, expired, or attention (underpaid / refunded / stuck — we will
     * be in touch).
     */
    private function state(Payment $payment): string
    {
        return match (true) {
            $payment->granted_at !== null && ! in_array($payment->status, [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED], true) => 'granted',
            $payment->status === Payment::STATUS_PAYING => 'confirming',
            $payment->isSettled(), $payment->status === Payment::STATUS_UNDERPAID,
            $payment->status === Payment::STATUS_REFUNDING, $payment->status === Payment::STATUS_REFUNDED,
            $payment->status === Payment::STATUS_FAILED => 'attention',
            $payment->status === Payment::STATUS_EXPIRED,
            $payment->invoice_expires_at?->isPast() === true => 'expired',
            default => 'pending',
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Quote $quote): array
    {
        $product = $quote->product;
        $months = $product->monthsEquivalent();

        return [
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'badge' => $product->badge,
            'plan' => $product->plan ? ['slug' => $product->plan->slug, 'name' => $product->plan->name] : null,
            'duration' => [
                'unit' => $product->duration_unit,
                'count' => $product->duration_count,
                'label' => $product->durationLabel(),
            ],
            'per_month_usd' => $months ? Quote::money((int) round($quote->amountCents() / $months)) : null,
        ] + $quote->toArray();
    }
}
