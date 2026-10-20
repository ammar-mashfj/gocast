<?php

namespace App\Services\Billing;

use App\Models\Discount;
use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Prices products from the database: list price, minus at most ONE discount.
 *
 * Discounts never stack. A running automatic sale applies to everyone; a
 * coupon replaces it only when it takes off more, so a founder's code can
 * never be worth less than what a stranger pays that day.
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

    public function quote(Product $product, ?string $code = null, ?User $user = null): Quote
    {
        $list = $product->priceCents();
        $sale = $this->bestSale($product, $list);
        $saleOff = $sale?->offCents($list) ?? 0;

        $code = Discount::normalizeCode($code);

        if ($code === null) {
            return new Quote($product, $list, $sale, $saleOff);
        }

        $coupon = Discount::where('code', $code)->with('products')->first();
        $error = $this->couponProblem($coupon, $product, $user, $list);

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

    /** The running automatic sale that takes the most off $product, if any. */
    private function bestSale(Product $product, int $listCents): ?Discount
    {
        $this->sales ??= Discount::automatic()->where('active', true)->with('products')->get();

        return $this->sales
            ->filter(fn (Discount $d) => $d->isRunning() && ! $d->isUsedUp() && $d->appliesTo($product))
            ->filter(fn (Discount $d) => $listCents - $d->offCents($listCents) >= self::MIN_CENTS)
            ->sortByDesc(fn (Discount $d) => $d->offCents($listCents))
            ->first();
    }
}
