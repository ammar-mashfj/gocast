<?php

namespace App\Services\Billing;

use App\Models\Discount;
use App\Models\Product;

/**
 * What one product costs one buyer right now: the list price, the discount
 * that applies (a running sale, or their coupon when it beats the sale), and
 * the total.
 *
 * `couponError` is set when a code was given and is not the discount used —
 * invalid, used up, or simply worse than the sale. Checkout refuses on it, so
 * nobody pays thinking a coupon applied when it did not.
 */
final readonly class Quote
{
    public function __construct(
        public Product $product,
        public int $listCents,
        public ?Discount $discount,
        public int $offCents,
        public ?string $couponError = null,
    ) {}

    public function amountCents(): int
    {
        return $this->listCents - $this->offCents;
    }

    public static function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'product' => $this->product->slug,
            'list_price_usd' => self::money($this->listCents),
            'discount_usd' => self::money($this->offCents),
            'price_usd' => self::money($this->amountCents()),
            'discount' => $this->discount ? [
                'label' => $this->discount->describe(),
                'code' => $this->discount->code,
                'ends_at' => $this->discount->ends_at?->toIso8601String(),
            ] : null,
            'coupon_error' => $this->couponError,
        ];
    }
}
