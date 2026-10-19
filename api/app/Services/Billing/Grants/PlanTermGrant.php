<?php

namespace App\Services\Billing\Grants;

use App\Models\Payment;
use App\Models\Plan;
use App\Models\Product;
use App\Models\User;
use App\Notifications\ProAccessGranted;
use App\Services\PlanTerm;

/**
 * A plan for a fixed term — "Pro · 3 months" — or for good ("Lifetime").
 *
 * Applied through PlanTerm::apply(), the same writer as an admin approving a
 * request: a payment made while a term is still running is added to its end,
 * and an account on a hand-made plan is never overwritten.
 */
class PlanTermGrant implements PurchaseGrant
{
    public function refusal(Product $product, User $user): ?string
    {
        $plan = $product->plan;

        if ($plan === null || $product->durationLabel() === null) {
            return "{$product->name} can't be bought right now.";
        }

        if (PlanTerm::conflict($user, $plan, withTerm: true) === null) {
            return null;
        }

        return $user->plan_id === $plan->id
            ? "You already have {$plan->name} with no end date, so there's nothing to pay for."
            : "Your account is on a plan we set up for you by hand, so it can't be changed here. Email hello@gocast.fm and we'll sort it out.";
    }

    public function apply(Payment $payment, User $user): GrantResult|string
    {
        $plan = $payment->plan_id ? Plan::find($payment->plan_id) : null;
        $term = $payment->term();

        if ($plan === null || ($term === null && ! $payment->isLifetime())) {
            return 'Paid, but the plan or term this payment was for no longer exists. Grant it by hand from Stations.';
        }

        $applied = $payment->isLifetime()
            ? PlanTerm::applyPermanent($user, $plan)
            : PlanTerm::apply($user, $plan, $term);

        if (is_string($applied)) {
            return "Paid, but not granted: {$applied} Grant or refund by hand.";
        }

        [$until, $extended] = $applied;

        return new GrantResult($until, $extended);
    }

    public function notify(User $user, Payment $payment, GrantResult $result): void
    {
        $plan = Plan::find($payment->plan_id);

        if ($plan === null) {
            return;
        }

        $user->notify(new ProAccessGranted(
            $plan,
            $result->until,
            $payment->durationLabel(),
            paid: true,
            extended: $result->extended,
        ));
    }
}
