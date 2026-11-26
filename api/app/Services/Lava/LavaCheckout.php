<?php

namespace App\Services\Lava;

use App\Models\LavaMembership;
use App\Models\LavaPayment;
use App\Models\Product;
use App\Models\User;
use App\Services\Billing\CheckoutRefused;
use App\Services\Billing\Pricing;
use App\Services\Billing\Quote;
use App\Services\PlanTerm;

/**
 * Starts a card purchase through lava.top.
 *
 * Two routes, picked by product:
 * - the membership product (`services.lava.membership_product`, 1 month):
 *   lava.top's monthly membership, charged again every month by lava.top.
 *   Its price lives in lava.top, so checkout refuses when ours differs
 *   rather than show one price and charge another. No coupons.
 * - every other product: the one "price through the API" pack product, sold
 *   once at our own price, coupons and sales included.
 *
 * Like the OxaPay checkout, the client sends only a slug and a code; what is
 * charged and granted is worked out here and copied onto the row.
 */
class LavaCheckout
{
    public function __construct(
        private readonly Pricing $pricing,
        private readonly LavaClient $lava,
    ) {}

    public static function enabled(): bool
    {
        $config = (array) config('services.lava');

        if (blank($config['webhook_secret'] ?? null)) {
            return false;
        }

        if (($config['driver'] ?? 'lava') === 'fake') {
            // The fake client grants Pro with no money moving: never live.
            return ! app()->isProduction();
        }

        return filled($config['api_key'] ?? null) && filled($config['membership_offer_id'] ?? null) && filled($config['pack_offer_id'] ?? null);
    }

    public static function isMembershipProduct(Product $product): bool
    {
        return $product->slug === config('services.lava.membership_product');
    }

    /**
     * @throws CheckoutRefused
     */
    public function start(User $user, string $productSlug, ?string $code, string $method = LavaPayment::METHOD_CARD): LavaPayment
    {
        if (! self::enabled()) {
            throw new CheckoutRefused('Card payments are not switched on yet. Please try again later.', 503);
        }

        $product = Product::active()->with('plan')->where('slug', $productSlug)->first();

        if ($product === null) {
            throw new CheckoutRefused('That plan is not for sale any more. Reload the page and pick another.', 404);
        }

        // Fresh: the session's copy can predate a payment made in another tab.
        $user->refresh();

        $refusal = $this->refusal($product, $user);

        if ($refusal !== null) {
            throw new CheckoutRefused($refusal, 409);
        }

        $membership = self::isMembershipProduct($product);

        if ($membership) {
            $quote = $this->membershipQuote($product, $code);
        } else {
            $quote = $this->pricing->quote($product, $code, $user);

            if ($quote->couponError !== null) {
                throw new CheckoutRefused($quote->couponError);
            }
        }

        $amount = Quote::money($quote->amountCents());

        // Pressing Pay twice reopens the payment already waiting. A declined
        // one too: lava.top's page takes another card on the same charge, and
        // a second page would be a second membership if both got paid.
        $open = LavaPayment::where('user_id', $user->id)
            ->where('product_id', $product->id)
            ->where('discount_id', $quote->discount?->id)
            ->where('amount_usd', $amount)
            ->where('method', $method)
            ->whereIn('status', [LavaPayment::STATUS_NEW, LavaPayment::STATUS_FAILED])
            ->whereNotNull('contract_id')
            ->whereNotNull('payment_url')
            ->where('created_at', '>', now()->subMinutes(50))
            ->latest('id')
            ->first();

        if ($open !== null) {
            // Back to waiting, so the status dialog polls it rather than
            // showing the old decline.
            if ($open->status === LavaPayment::STATUS_FAILED) {
                $open->forceFill(['status' => LavaPayment::STATUS_NEW])->save();
            }

            return $open;
        }

        $payment = LavaPayment::create([
            'user_id' => $user->id,
            'product_id' => $product->id,
            'discount_id' => $quote->discount?->id,
            'kind' => $membership ? LavaPayment::KIND_MEMBERSHIP : LavaPayment::KIND_PACK,
            'product_name' => $product->name,
            'plan_id' => $product->plan_id,
            'duration_unit' => $product->duration_unit,
            'duration_count' => $product->duration_count,
            'list_price_usd' => Quote::money($quote->listCents),
            'discount_code' => $quote->discount?->code,
            'discount_usd' => Quote::money($quote->offCents),
            'amount_usd' => $amount,
            'email' => $user->email,
            'method' => $method,
            'status' => LavaPayment::STATUS_NEW,
        ]);

        try {
            $invoice = $this->lava->createInvoice(
                email: $user->email,
                offerId: (string) config($membership ? 'services.lava.membership_offer_id' : 'services.lava.pack_offer_id'),
                periodicity: $membership ? 'MONTHLY' : 'ONE_TIME',
                amountUsd: $membership ? null : $amount,
                method: $method,
                returnUrl: self::returnUrl($payment),
            );
        } catch (LavaException $e) {
            report($e);
            // The buyer was told to retry; nothing for the review list. The
            // exception is already reported, and kept on the row as well.
            $payment->forceFill(['status' => LavaPayment::STATUS_FAILED, 'payload' => ['error' => $e->getMessage()]])->save();

            throw new CheckoutRefused("We couldn't reach the payment provider. Please try again in a minute.", 502);
        }

        $payment->forceFill([
            'contract_id' => $invoice->contractId,
            'payment_url' => $invoice->paymentUrl,
        ])->save();

        return $payment;
    }

    public static function returnUrl(LavaPayment $payment): string
    {
        return rtrim((string) config('services.frontend_url'), '/').'/dashboard/settings?lava='.$payment->uuid;
    }

    /**
     * Why $user can't buy $product here, or null. A pack bought while the
     * membership runs is allowed: it adds to the end date.
     */
    private function refusal(Product $product, User $user): ?string
    {
        $plan = $product->plan;

        if ($plan === null || $product->durationLabel() === null) {
            return "{$product->name} can't be bought right now.";
        }

        if (self::isMembershipProduct($product) && LavaMembership::activeFor($user) !== null) {
            return 'You already have the monthly plan, and it renews on its own. Cancel it on your Account page first if you want to start again.';
        }

        if (PlanTerm::conflict($user, $plan, withTerm: ! $product->isLifetime()) === null) {
            return null;
        }

        return $user->plan_id === $plan->id
            ? "You already have {$plan->name} with no end date, so there's nothing to pay for."
            : "Your account is on a plan we set up for you by hand, so it can't be changed here. Email hello@gocast.fm and we'll sort it out.";
    }

    /**
     * The membership at our listed price, after checking lava.top charges the
     * same. No sale or coupon: lava.top's fixed price is what every renewal
     * charges, so a discount here would only hold for the first month.
     *
     * @throws CheckoutRefused
     */
    private function membershipQuote(Product $product, ?string $code): Quote
    {
        if (filled($code)) {
            throw new CheckoutRefused("Coupons can't be used on the monthly plan. Pick a longer term to use one.");
        }

        $ours = number_format((float) $product->price_usd, 2, '.', '');

        try {
            $theirs = $this->lava->offerPriceUsd((string) config('services.lava.membership_offer_id'));
        } catch (LavaException $e) {
            report($e);

            throw new CheckoutRefused("We couldn't reach the payment provider. Please try again in a minute.", 502);
        }

        if ($theirs !== $ours) {
            report(new LavaException("lava.top's membership price is ".($theirs ?? 'missing')." but {$product->slug} is {$ours}. Make them match."));

            throw new CheckoutRefused("The monthly plan can't be bought right now. Pick another term, or try again later.", 503);
        }

        return new Quote($product, $product->priceCents(), null, 0);
    }
}
