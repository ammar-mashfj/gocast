<?php

namespace App\Services\Billing\Grants;

use App\Models\Payment;
use App\Models\Product;
use App\Models\User;

/**
 * What paying for a product does to the account, for one `grant_type`.
 *
 * The one place a brand-new KIND of thing to sell needs code: write a class
 * here and add it to Grants::for(). Prices, terms, sales and coupons for it
 * are then rows like everything else.
 */
interface PurchaseGrant
{
    /**
     * Why $user should not be sold $product, in words for them, or null.
     * Checked before an invoice exists, so nobody pays for something that
     * cannot be granted.
     */
    public function refusal(Product $product, User $user): ?string;

    /**
     * Apply a settled $payment to $user. Runs inside PaymentProcessor's
     * transaction with both rows locked. Returns the result, or why it could
     * not be applied (for the admin — it lands in `review_reason`).
     */
    public function apply(Payment $payment, User $user): GrantResult|string;

    /** Tell the buyer, after the transaction has committed. */
    public function notify(User $user, Payment $payment, GrantResult $result): void;
}
