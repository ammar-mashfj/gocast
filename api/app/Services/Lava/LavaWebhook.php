<?php

namespace App\Services\Lava;

use App\Models\Discount;
use App\Models\LavaMembership;
use App\Models\LavaPayment;
use App\Models\Plan;
use App\Models\Product;
use App\Models\User;
use App\Notifications\LavaMembershipRenewed;
use App\Notifications\ProAccessGranted;
use App\Services\AdminTelegram;
use App\Services\PlanTerm;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Acts on one lava.top webhook.
 *
 * lava.top's webhooks are not signed (only a shared password, checked by the
 * controller), so no webhook body is trusted on its own about money: before
 * granting anything, the charge is fetched back from lava.top's API and must
 * be COMPLETED, in USD, for the amount on our row. A failed fetch throws
 * LavaException, the controller answers 503, and lava.top retries.
 *
 * The body carries no id of ours, so charges are found by lava.top's own ids:
 * `contractId` for a pack or a first membership payment (saved at checkout),
 * `parentContractId` for a renewal (the membership's first charge).
 *
 * Every grant happens under row locks with `granted_at` as the once-only
 * marker, so a redelivered webhook changes nothing.
 */
class LavaWebhook
{
    public function __construct(
        private readonly LavaClient $lava,
        private readonly AdminTelegram $telegram,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws LavaException when lava.top can't be asked to confirm a charge,
     *                       or has not finished it yet (both retried by lava.top).
     */
    public function handle(array $data): void
    {
        $event = (string) ($data['eventType'] ?? $data['event_type'] ?? '');

        match ($event) {
            'payment.success' => $this->paymentSucceeded($data),
            'payment.failed' => $this->paymentFailed($data),
            'subscription.recurring.payment.success' => $this->renewalSucceeded($data),
            'subscription.recurring.payment.failed' => $this->renewalFailed($data),
            'subscription.cancelled' => $this->membershipCancelled($data),
            'refund.success' => $this->reversed($data, LavaPayment::STATUS_REFUNDED),
            'chargeback.initiated' => $this->reversed($data, LavaPayment::STATUS_CHARGEBACK),
            default => Log::info('lava.top webhook with an event we do not handle', ['event' => $event]),
        };
    }

    /**
     * A pack, or the first payment of a membership.
     *
     * @param  array<string, mixed>  $data
     */
    private function paymentSucceeded(array $data): void
    {
        $contractId = (string) ($data['contractId'] ?? '');
        $payment = $contractId === '' ? null : LavaPayment::where('contract_id', $contractId)->first();

        if ($payment === null) {
            // A sale from a link made by hand in lava.top, not from our
            // checkout: nobody here knows which account it is for.
            $this->telegram->lavaNeedsReview(
                'Payment from outside the dashboard',
                'lava.top payment '.$contractId.' for "'.($data['product']['title'] ?? '?').'" ($'.($data['amount'] ?? '?').' '.($data['currency'] ?? '').') was not started from our checkout. Upgrade the account by hand.',
                $data['buyer']['email'] ?? null,
            );

            return;
        }

        if ($payment->granted_at !== null) {
            return;
        }

        $problem = $this->confirm($payment->contract_id, (string) $payment->amount_usd);

        $outcome = DB::transaction(function () use ($payment, $data, $problem) {
            /** @var LavaPayment $locked */
            $locked = LavaPayment::whereKey($payment->id)->lockForUpdate()->first();

            if ($locked->granted_at !== null) {
                return null;
            }

            $locked->payload = $data;

            if ($problem !== null) {
                return $this->flag($locked, $problem);
            }

            $locked->status = LavaPayment::STATUS_PAID;
            $locked->paid_at ??= now();

            $user = $locked->user_id ? User::whereKey($locked->user_id)->lockForUpdate()->first() : null;

            if ($user === null) {
                return $this->flag($locked, 'Paid, but the account has been deleted. Refund it in lava.top.');
            }

            $plan = $locked->plan_id ? Plan::find($locked->plan_id) : null;

            if ($plan === null || ($locked->term() === null && ! $locked->isLifetime())) {
                return $this->flag($locked, 'Paid, but the plan or term no longer exists. Grant it by hand from Stations.');
            }

            $applied = $locked->isLifetime()
                ? PlanTerm::applyPermanent($user, $plan)
                : PlanTerm::apply($user, $plan, $locked->term());

            if (is_string($applied)) {
                return $this->flag($locked, "Paid, but not granted: {$applied} Grant or refund by hand.");
            }

            [$until, $extended] = $applied;

            if ($locked->kind === LavaPayment::KIND_MEMBERSHIP) {
                // Once, on the first charge: lava.top retries a failed renewal
                // after 8h and 24h, and Pro should still be on when it lands.
                // Every renewal then adds a month to this, so it never drifts.
                $until = $until->copy()->addDays((int) config('services.lava.membership_grace_days', 2));
                $user->forceFill(['plan_expires_at' => $until])->save();

                $membership = LavaMembership::firstOrCreate(
                    ['contract_id' => $locked->contract_id],
                    [
                        'user_id' => $user->id,
                        'plan_id' => $plan->id,
                        'email' => (string) ($data['buyer']['email'] ?? $locked->email),
                        'status' => LavaMembership::STATUS_ACTIVE,
                    ],
                );

                $locked->lava_membership_id = $membership->id;
            }

            $locked->granted_at = now();
            $locked->granted_until = $until;
            $locked->review_reason = null;
            $locked->save();

            if ($locked->discount_id !== null) {
                Discount::whereKey($locked->discount_id)->increment('redemptions_count');
            }

            return [$user, $plan, $until, $extended];
        });

        $fresh = $payment->fresh();

        if (is_array($outcome)) {
            /** @var array{0: User, 1: Plan, 2: Carbon|null, 3: bool} $outcome */
            [$user, $plan, $until, $extended] = $outcome;
            $membership = $fresh->kind === LavaPayment::KIND_MEMBERSHIP;

            $user->notify(new ProAccessGranted(
                $plan,
                $until,
                $fresh->durationLabel(),
                paid: true,
                extended: $extended && ! $membership,
                autoRenews: $membership,
            ));
            $this->telegram->lavaPaymentGranted($fresh);
        } elseif ($outcome === 'flagged') {
            $this->telegram->lavaNeedsReview('Payment needs review', (string) $fresh->review_reason, $fresh->email);
        }
    }

    /**
     * The buyer gave up or the card was declined. lava.top's page lets them
     * try again on the same charge, so a later success still grants.
     *
     * @param  array<string, mixed>  $data
     */
    private function paymentFailed(array $data): void
    {
        $contractId = (string) ($data['contractId'] ?? '');

        LavaPayment::where('contract_id', $contractId)
            ->where('status', LavaPayment::STATUS_NEW)
            ->update(['status' => LavaPayment::STATUS_FAILED, 'review_reason' => mb_substr((string) ($data['errorMessage'] ?? ''), 0, 255) ?: null]);
    }

    /**
     * lava.top charged a membership again: one more month.
     *
     * @param  array<string, mixed>  $data
     */
    private function renewalSucceeded(array $data): void
    {
        $contractId = (string) ($data['contractId'] ?? '');
        $parentId = (string) ($data['parentContractId'] ?? '');
        $membership = $parentId === '' ? null : LavaMembership::where('contract_id', $parentId)->first();

        if ($membership === null || $contractId === '') {
            $this->telegram->lavaNeedsReview(
                'Renewal for a membership we do not know',
                "lava.top renewed membership {$parentId} (charge {$contractId}), which was not started from our checkout. Extend the account by hand.",
                $data['buyer']['email'] ?? null,
            );

            return;
        }

        if (LavaPayment::where('contract_id', $contractId)->whereNotNull('granted_at')->exists()) {
            return;
        }

        // Renewals are charged at whatever price the membership was bought
        // at (lava.top keeps old subscribers on their price), so the amount is
        // lava.top's, read off the confirmed charge, not compared to ours.
        $invoice = $this->lava->invoice($contractId);
        $amount = number_format((float) ($invoice['receipt']['amount'] ?? $data['amount'] ?? 0), 2, '.', '');
        $problem = $this->problemWith($invoice, null, $parentId);

        $product = Product::where('slug', config('services.lava.membership_product'))->first();

        $outcome = DB::transaction(function () use ($membership, $contractId, $data, $amount, $problem, $product) {
            $payment = LavaPayment::firstOrCreate(
                ['contract_id' => $contractId],
                [
                    'user_id' => $membership->user_id,
                    'product_id' => $product?->id,
                    'lava_membership_id' => $membership->id,
                    'kind' => LavaPayment::KIND_RENEWAL,
                    'product_name' => ($product?->name ?? 'Pro · 1 month').' (renewal)',
                    'plan_id' => $membership->plan_id,
                    'duration_unit' => 'month',
                    'duration_count' => 1,
                    'list_price_usd' => $amount,
                    'amount_usd' => $amount,
                    'email' => $membership->email,
                    'method' => LavaPayment::where('contract_id', $membership->contract_id)->value('method') ?? LavaPayment::METHOD_CARD,
                    'status' => LavaPayment::STATUS_NEW,
                ],
            );

            /** @var LavaPayment $locked */
            $locked = LavaPayment::whereKey($payment->id)->lockForUpdate()->first();

            if ($locked->granted_at !== null) {
                return null;
            }

            $locked->payload = $data;

            if ($problem !== null) {
                return $this->flag($locked, $problem);
            }

            $locked->status = LavaPayment::STATUS_PAID;
            $locked->paid_at ??= now();

            $user = $locked->user_id ? User::whereKey($locked->user_id)->lockForUpdate()->first() : null;
            $plan = $locked->plan_id ? Plan::find($locked->plan_id) : null;

            if ($user === null || $plan === null) {
                return $this->flag($locked, 'Renewal paid, but the account or plan no longer exists. Cancel the membership and refund it in lava.top.');
            }

            $applied = PlanTerm::apply($user, $plan, $locked->term());

            if (is_string($applied)) {
                return $this->flag($locked, "Renewal paid, but not granted: {$applied} Grant or refund by hand.");
            }

            $locked->granted_at = now();
            $locked->granted_until = $applied[0];
            $locked->review_reason = null;
            $locked->save();

            return $user;
        });

        $payment = LavaPayment::where('contract_id', $contractId)->first();

        if ($outcome instanceof User) {
            $outcome->notify(new LavaMembershipRenewed($payment));
            $this->telegram->lavaPaymentGranted($payment);
        } elseif ($outcome === 'flagged') {
            $this->telegram->lavaNeedsReview('Renewal needs review', (string) $payment->review_reason, $payment->email);
        }
    }

    /**
     * A renewal charge failed. lava.top emails the buyer and retries after 8h
     * and 24h; after the last one it cancels the membership, which arrives
     * as subscription.cancelled. Recorded so the admin can see it happen.
     *
     * @param  array<string, mixed>  $data
     */
    private function renewalFailed(array $data): void
    {
        Log::info('lava.top membership renewal failed', [
            'contract_id' => $data['contractId'] ?? null,
            'parent_contract_id' => $data['parentContractId'] ?? null,
            'error' => $data['errorMessage'] ?? null,
        ]);
    }

    /**
     * No more charges. Pro is left alone: it already runs to the end of the
     * last month paid for (plus the grace days), and plans:expire ends it.
     *
     * @param  array<string, mixed>  $data
     */
    private function membershipCancelled(array $data): void
    {
        $contractId = (string) ($data['contractId'] ?? '');
        $membership = $this->membershipFor($contractId);

        if ($membership === null) {
            Log::info('lava.top cancelled a membership we do not know', ['contract_id' => $contractId]);

            return;
        }

        if (! $membership->isActive()) {
            return;
        }

        $membership->forceFill([
            'status' => LavaMembership::STATUS_CANCELLED,
            'cancelled_at' => self::date($data['cancelledAt'] ?? null) ?? now(),
            'ends_at' => self::date($data['willExpireAt'] ?? null),
            'payload' => $data,
        ])->save();
    }

    /**
     * A refund or a chargeback. Pro is not taken away automatically — a
     * partial refund, or a chargeback we win, should not cost the station its
     * plan — so a human is told and decides.
     *
     * @param  array<string, mixed>  $data
     */
    private function reversed(array $data, string $status): void
    {
        $body = (array) ($data['data'] ?? []);
        $contractId = (string) ($body['parent_invoice_id'] ?? '');
        $payment = $contractId === '' ? null : LavaPayment::where('contract_id', $contractId)->first();
        $what = $status === LavaPayment::STATUS_REFUNDED ? 'Refund' : 'Chargeback';

        if ($payment === null) {
            $this->telegram->lavaNeedsReview(
                "{$what} for a payment we do not know",
                "lava.top charge {$contractId}, \$".($body['amount'] ?? '?').'.',
                $body['customer_email'] ?? null,
            );

            return;
        }

        if ($payment->status === $status) {
            return;
        }

        $payment->forceFill([
            'status' => $status,
            'review_reason' => "{$what} on lava.top. Pro was left on; take it away by hand if they should lose it.",
        ])->save();

        if (($body['subscription_cancelled'] ?? false) === true) {
            $this->membershipCancelled(['contractId' => $contractId]);
        }

        $this->telegram->lavaNeedsReview("{$what}: {$payment->product_name}", (string) $payment->review_reason, $payment->email);
    }

    /**
     * Why lava.top's own record of the charge doesn't back the webhook up, or
     * null when it does.
     *
     * @throws LavaException
     */
    private function confirm(string $contractId, string $amountUsd): ?string
    {
        return $this->problemWith($this->lava->invoice($contractId), $amountUsd, null);
    }

    /**
     * @param  array<string, mixed>  $invoice
     */
    private function problemWith(array $invoice, ?string $amountUsd, ?string $parentId): ?string
    {
        $status = (string) ($invoice['status'] ?? '');
        $currency = (string) ($invoice['receipt']['currency'] ?? '');
        $paid = (float) ($invoice['receipt']['amount'] ?? 0);

        // The webhook can beat lava.top's own API to "completed". Throwing
        // answers 503, and lava.top retries for about five hours.
        if (in_array($status, ['NEW', 'IN_PROGRESS'], true)) {
            throw new LavaException("lava.top still reports the charge as {$status}; retry later.");
        }

        if ($status !== 'COMPLETED') {
            return "The webhook said paid, but lava.top reports the charge as \"{$status}\". Nothing was granted.";
        }

        if ($currency !== 'USD') {
            return "lava.top reports the charge in {$currency}, not USD. Check the amount and grant by hand.";
        }

        if ($amountUsd !== null && abs($paid - (float) $amountUsd) > 0.009) {
            return "lava.top reports \${$paid} paid, but checkout asked for \${$amountUsd}. Nothing was granted.";
        }

        $reportedParent = $invoice['parentInvoice']['id'] ?? null;

        if ($parentId !== null && $reportedParent !== null && $reportedParent !== $parentId) {
            return "lava.top says this charge belongs to membership {$reportedParent}, not {$parentId}. Nothing was granted.";
        }

        return null;
    }

    /** The membership a charge id names: its first charge, or any charge of it. */
    private function membershipFor(string $contractId): ?LavaMembership
    {
        if ($contractId === '') {
            return null;
        }

        return LavaMembership::where('contract_id', $contractId)->first()
            ?? LavaPayment::where('contract_id', $contractId)->whereNotNull('lava_membership_id')->first()?->membership;
    }

    /**
     * Record why a human needs to look, once: a redelivered webhook with the
     * same problem saves but does not alert again.
     */
    private function flag(LavaPayment $payment, string $reason): ?string
    {
        $reason = mb_substr($reason, 0, 255);
        $isNew = $payment->review_reason !== $reason;
        $payment->status = LavaPayment::STATUS_REVIEW;
        $payment->review_reason = $reason;
        $payment->save();

        return $isNew ? 'flagged' : null;
    }

    private static function date(mixed $value): ?Carbon
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (Throwable) {
            return null;
        }
    }
}
