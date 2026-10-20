<?php

namespace App\Services\Billing;

use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Services\Billing\Gateway\GatewayException;
use App\Services\Billing\Gateway\PaymentGateway;
use App\Services\Billing\Grants\Grants;

/**
 * Starts a purchase: price it, record it, and get OxaPay's payment page.
 *
 * The client sends only a product slug and maybe a coupon. The price, the
 * discount and what it grants are worked out here and copied onto the
 * payment row, so nothing the browser says can change what is charged or
 * what is granted.
 */
class Checkout
{
    public function __construct(
        private readonly Pricing $pricing,
        private readonly PaymentGateway $gateway,
    ) {}

    /**
     * @throws CheckoutRefused
     */
    public function start(User $user, string $productSlug, ?string $code): Payment
    {
        if (blank(config('services.oxapay.merchant_key'))) {
            throw new CheckoutRefused('Payments are not switched on yet. Please try again later.', 503);
        }

        $product = Product::active()->where('slug', $productSlug)->first();

        if ($product === null) {
            throw new CheckoutRefused('That plan is not for sale any more. Reload the page and pick another.', 404);
        }

        // Read fresh: the plan decides what may be sold, and the session's
        // copy can predate an admin change or a payment made in another tab.
        $user->refresh();

        $refusal = Grants::for($product->grant_type)->refusal($product, $user);

        if ($refusal !== null) {
            throw new CheckoutRefused($refusal, 409);
        }

        $quote = $this->pricing->quote($product, $code, $user);

        if ($quote->couponError !== null) {
            throw new CheckoutRefused($quote->couponError);
        }

        // Pressing Pay twice, or coming back from OxaPay and pressing it
        // again, reopens the invoice already waiting rather than stacking a
        // second one for the same thing.
        $open = Payment::where('user_id', $user->id)
            ->where('product_id', $product->id)
            ->where('discount_id', $quote->discount?->id)
            ->where('amount_usd', Quote::money($quote->amountCents()))
            ->whereIn('status', [Payment::STATUS_NEW, Payment::STATUS_WAITING])
            ->whereNotNull('payment_url')
            ->where('invoice_expires_at', '>', now()->addMinutes(10))
            ->latest('id')
            ->first();

        if ($open !== null) {
            return $open;
        }

        $payment = Payment::create([
            'user_id' => $user->id,
            'product_id' => $product->id,
            'discount_id' => $quote->discount?->id,
            'product_name' => $product->name,
            'grant_type' => $product->grant_type,
            'plan_id' => $product->plan_id,
            'duration_unit' => $product->duration_unit,
            'duration_count' => $product->duration_count,
            'list_price_usd' => Quote::money($quote->listCents),
            'discount_code' => $quote->discount?->code,
            'discount_usd' => Quote::money($quote->offCents),
            'amount_usd' => Quote::money($quote->amountCents()),
            'sandbox' => $this->gateway->isSandbox(),
            'status' => Payment::STATUS_NEW,
        ]);

        try {
            $invoice = $this->gateway->createInvoice($payment, self::callbackUrl(), self::returnUrl($payment));
        } catch (GatewayException $e) {
            report($e);
            $payment->forceFill(['status' => Payment::STATUS_FAILED, 'review_reason' => $e->getMessage()])->save();

            throw new CheckoutRefused("We couldn't reach the payment provider. Please try again in a minute.", 502);
        }

        $payment->forceFill([
            'track_id' => $invoice->trackId,
            'payment_url' => $invoice->paymentUrl,
            'invoice_expires_at' => $invoice->expiresAt,
        ])->save();

        return $payment;
    }

    public static function callbackUrl(): string
    {
        return (string) (config('services.oxapay.callback_url') ?: route('webhooks.oxapay'));
    }

    public static function returnUrl(Payment $payment): string
    {
        return rtrim((string) config('services.frontend_url'), '/').'/dashboard/settings?payment='.$payment->uuid;
    }
}
