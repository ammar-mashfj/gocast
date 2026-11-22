<?php

namespace App\Services\Billing;

use App\Models\Discount;
use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Services\Billing\Gateway\GatewayException;
use App\Services\Billing\Gateway\GetlyGateway;
use App\Services\Billing\Gateway\PaymentGateway;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Prices products from the database: list price, minus at most ONE discount.
 *
 * Discounts never stack. A running automatic sale applies to everyone; a
 * coupon replaces it only when it takes off more, so a founder's code can
 * never be worth less than what a stranger pays that day.
 *
 * Coupons come from wherever checkout takes payment. With Getly, a code is
 * looked up in the store's Getly coupons, since Getly applies it again on its
 * own page and is the one place they are made, and automatic sales from our
 * table are not applied at all (Getly would never charge them). With OxaPay,
 * coupons and sales are rows in that table.
 *
 * Nothing here writes. A coupon's use is counted when its payment is
 * confirmed (PaymentProcessor), so these checks are repeated at checkout and
 * honoured at grant time even if two people race for the last use — both paid.
 */
class Pricing
{
    /**
     * The smallest total we create an invoice for. A discount that would go
     * below it is refused rather than producing an invoice OxaPay rejects or
     * a free plan nobody meant to give; free grants are an admin action.
     */
    public const MIN_CENTS = 100;

    /** @var Collection<int, Discount>|null */
    private ?Collection $sales = null;

    public function __construct(private readonly PaymentGateway $gateway) {}

    public function quote(Product $product, ?string $code = null, ?User $user = null): Quote
    {
        $list = $product->priceCents();
        $sale = $this->bestSale($product, $list);
        $saleOff = $sale?->offCents($list) ?? 0;

        $code = Discount::normalizeCode($code);

        if ($code === null) {
            return new Quote($product, $list, $sale, $saleOff);
        }

        if ($this->gateway instanceof GetlyGateway) {
            [$coupon, $error] = $this->getlyCoupon($code, $list);
        } else {
            $coupon = Discount::where('code', $code)->with('products')->first();
            $error = $this->couponProblem($coupon, $product, $user, $list);
        }

        if ($error === null && $coupon->offCents($list) <= $saleOff) {
            $error = 'The sale price is already lower than this coupon.';
        }

        return $error === null
            ? new Quote($product, $list, $coupon, $coupon->offCents($list))
            : new Quote($product, $list, $sale, $saleOff, $error);
    }

    /**
     * Why $coupon cannot be used on $product by $user, in words for the buyer,
     * or null when it can.
     */
    private function couponProblem(?Discount $coupon, Product $product, ?User $user, int $listCents): ?string
    {
        if ($coupon === null || ! $coupon->active) {
            return "That coupon isn't valid.";
        }

        if ($coupon->starts_at?->isFuture()) {
            return "That coupon isn't valid yet.";
        }

        if ($coupon->ends_at !== null && ! $coupon->ends_at->isFuture()) {
            return 'That coupon has expired.';
        }

        if (! $coupon->appliesTo($product)) {
            return "That coupon doesn't apply to {$product->name}.";
        }

        if ($coupon->isUsedUp()) {
            return 'That coupon has already been used.';
        }

        if ($user !== null && $coupon->per_user_limit !== null) {
            $used = Payment::where('user_id', $user->id)
                ->where('discount_id', $coupon->id)
                ->whereNotNull('granted_at')
                ->count();

            if ($used >= $coupon->per_user_limit) {
                return "You've already used this coupon.";
            }
        }

        if ($listCents - $coupon->offCents($listCents) < self::MIN_CENTS) {
            return "That coupon can't be used at checkout. Reply to our email and we'll sort it out.";
        }

        return null;
    }

    /**
     * A Getly coupon as an unsaved Discount (so Quote and the dialog treat it
     * like any other), or why it can't be used. Getly's own rules: active,
     * not expired, not used up, and the price at least its minimum order.
     * Getly coupons are store-wide, so there is no per-product check.
     *
     * @return array{0: Discount|null, 1: string|null}
     */
    private function getlyCoupon(string $code, int $listCents): array
    {
        /** @var GetlyGateway $gateway */
        $gateway = $this->gateway;

        try {
            $found = $gateway->coupons()[$code] ?? null;
        } catch (GatewayException $e) {
            report($e);

            return [null, "We couldn't check that coupon right now. Please try again in a minute."];
        }

        if ($found === null || ($found['isActive'] ?? true) === false) {
            return [null, "That coupon isn't valid."];
        }

        $expires = isset($found['expiresAt']) ? Carbon::parse((string) $found['expiresAt']) : null;

        if ($expires !== null && $expires->isPast()) {
            return [null, 'That coupon has expired.'];
        }

        if (isset($found['maxUses']) && (int) ($found['usedCount'] ?? 0) >= (int) $found['maxUses']) {
            return [null, 'That coupon has already been used.'];
        }

        if ($listCents < (int) ($found['minOrderAmountCents'] ?? 0)) {
            return [null, 'That coupon only works on a longer plan.'];
        }

        $isPercent = ($found['type'] ?? '') === 'percentage';

        $coupon = (new Discount)->forceFill([
            'name' => 'Getly coupon',
            'code' => $code,
            'percent_off' => $isPercent ? (float) ($found['value'] ?? 0) : null,
            'amount_off_usd' => $isPercent ? null : ((int) ($found['valueCents'] ?? $found['value'] ?? 0)) / 100,
            'ends_at' => $expires,
            'active' => true,
        ]);
        $coupon->setRelation('products', new \Illuminate\Database\Eloquent\Collection);

        if ($listCents - $coupon->offCents($listCents) < self::MIN_CENTS) {
            return [null, "That coupon can't be used at checkout. Reply to our email and we'll sort it out."];
        }

        return [$coupon, null];
    }

    /** The running automatic sale that takes the most off $product, if any. */
    private function bestSale(Product $product, int $listCents): ?Discount
    {
        // Getly charges its own product price and only carries a coupon code,
        // so a sale from our table would be shown but never charged.
        if ($this->gateway instanceof GetlyGateway) {
            return null;
        }

        $this->sales ??= Discount::automatic()->where('active', true)->with('products')->get();

        return $this->sales
            ->filter(fn (Discount $d) => $d->isRunning() && ! $d->isUsedUp() && $d->appliesTo($product))
            ->filter(fn (Discount $d) => $listCents - $d->offCents($listCents) >= self::MIN_CENTS)
            ->sortByDesc(fn (Discount $d) => $d->offCents($listCents))
            ->first();
    }
}
