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

        if ($payment->granted_at !== null || self::isReversed($payment)) {
            return;
        }

        $problem = $this->confirm($payment->contract_id, (string) $payment->amount_usd);

        $outcome = DB::transaction(function () use ($payment, $data, $problem) {
            /** @var LavaPayment $locked */
            $locked = LavaPayment::whereKey($payment->id)->lockForUpdate()->first();

            // A refund or chargeback that landed while lava.top was being
            // asked is final: a late "paid" must not undo it.
            if ($locked->granted_at !== null || self::isReversed($locked)) {
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

            // Checkout refuses a second membership, but two payment pages can
            // both be paid (a declined one retried after a new one was made).
            // Read under the user's lock, so two payments can't both miss it.
            $existing = $locked->kind === LavaPayment::KIND_MEMBERSHIP ? LavaMembership::activeFor($user) : null;

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
                // lava.top charges again a month from now, and retries a
                // failed renewal after 8h and 24h: Pro must still be on when
                // the last retry lands. So the term runs at least a month plus
                // the grace days from now. Time they already had on top only
                // pushes it further (then the renewal lands well before the
                // end anyway). Every renewal adds a month, so it never drifts.
                $floor = now()->addMonthNoOverflow()->addDays((int) config('services.lava.membership_grace_days', 2));

                if ($until->lt($floor)) {
                    $until = $floor;
                    $user->forceFill(['plan_expires_at' => $until])->save();
                }

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

            return [$user, $plan, $until, $extended, $existing];
        });

        $fresh = $payment->fresh();

        if (is_array($outcome)) {
            /** @var array{0: User, 1: Plan, 2: Carbon|null, 3: bool, 4: LavaMembership|null} $outcome */
            [$user, $plan, $until, $extended, $existing] = $outcome;
            $membership = $fresh->kind === LavaPayment::KIND_MEMBERSHIP;

            $user->notify(new ProAccessGranted(
                $plan,
                $until,
                $fresh->durationLabel(),
                paid: true,
                extended: $extended && ! $membership,
                // Not when lava.top's cancel beat the first charge here.
                autoRenews: $membership && $fresh->membership?->isActive() === true,
            ));
            $this->telegram->lavaPaymentGranted($fresh);

            if ($existing !== null) {
                // Granted (they paid for the month), and left running: which
                // one to cancel and refund is a human's call.
                $this->telegram->lavaNeedsReview(
                    'Two monthly plans on one account',
                    "This account now has two lava.top memberships charging every month: {$existing->contract_id} and {$fresh->contract_id}. Cancel one in lava.top and refund its charge.",
                    $fresh->email,
                );
            }
        } elseif ($outcome === 'flagged') {
            $note = '';

            if ($fresh->kind === LavaPayment::KIND_MEMBERSHIP) {
                // Not granted means no membership row, so nothing here (Account
                // page, account deletion) could ever stop lava.top charging
                // every month. Stop it now.
                $note = $this->stopCharges($fresh->contract_id, (string) ($data['buyer']['email'] ?? $fresh->email))
                    ? ' We cancelled the monthly charge with lava.top; refund the first payment.'
                    : ' lava.top could not be reached: cancel the monthly charge AND refund it in lava.top by hand.';
            }

            $this->telegram->lavaNeedsReview('Payment needs review', $fresh->review_reason.$note, $fresh->email);
        }
    }

    /**
     * Cancel a membership with lava.top. False when lava.top could not be
     * reached or refused: the caller tells the admin to do it by hand.
     */
    private function stopCharges(string $contractId, string $email): bool
    {
        try {
            $this->lava->cancelMembership($contractId, $email);

            return true;
        } catch (LavaException $e) {
            report($e);

            return false;
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

        // Not review_reason: a declined card is routine, and the review list
        // is for what a human must act on. The reason stays in the payload.
        LavaPayment::where('contract_id', $contractId)
            ->where('status', LavaPayment::STATUS_NEW)
            ->update(['status' => LavaPayment::STATUS_FAILED, 'payload' => json_encode($data)]);
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

        $known = LavaPayment::where('contract_id', $contractId)->first();

        if ($known !== null && self::isReversed($known) && $known->lava_membership_id === null) {
            // Refunded or charged back before this notice arrived (the row is
            // the placeholder reversed() left): now we know its membership,
            // stop that too, as reversed() would have.
            $known->forceFill(['lava_membership_id' => $membership->id, 'user_id' => $known->user_id ?? $membership->user_id])->save();
            $what = $known->status === LavaPayment::STATUS_CHARGEBACK ? 'Chargeback' : 'Refund';
            $note = $this->stopAfterReversal($known->fresh(), $what);

            if ($note !== '') {
                $this->telegram->lavaNeedsReview("{$what} of a renewal", "Renewal {$contractId} was reversed before it reached us; nothing was granted.{$note}", $membership->email);
            }

            return;
        }

        if ($known !== null && ($known->granted_at !== null || self::isReversed($known))) {
            return;
        }

        // Renewals are charged at whatever price the membership was bought
        // at (lava.top keeps old subscribers on their price), so the amount is
        // lava.top's, read off the confirmed charge, not compared to ours.
        $invoice = $this->lava->invoice($contractId);
        $amount = number_format((float) ($invoice['receipt']['amount'] ?? $data['amount'] ?? 0), 2, '.', '');
        $problem = $this->problemWith($invoice, null, $parentId);

        $product = Product::where('slug', config('services.lava.membership_product'))->first();

        // Set when the renewal is refused for a reason every later renewal
        // would hit too: then lava.top must stop charging, not just be told.
        $stop = false;

        $outcome = DB::transaction(function () use ($membership, $contractId, $data, $amount, $problem, $product, &$stop) {
            // createOrFirst: the same renewal delivered twice at once must
            // not hit the unique contract id and fail one of them.
            $payment = LavaPayment::createOrFirst(
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

            if ($locked->granted_at !== null || self::isReversed($locked)) {
                return null;
            }

            $locked->payload = $data;

            if ($problem !== null) {
                return $this->flag($locked, $problem);
            }

            // We stopped this membership over a refund or chargeback; a charge
            // that slipped through before lava.top took the cancel is not
            // more Pro for a disputed account.
            $stoppedReason = LavaMembership::whereKey($membership->id)->value('stopped_reason');

            if ($stoppedReason !== null) {
                $stop = true;

                return $this->flag($locked, "Charged after we stopped this monthly plan ({$stoppedReason}). Nothing was granted; refund it in lava.top.");
            }

            $locked->status = LavaPayment::STATUS_PAID;
            $locked->paid_at ??= now();

            $user = $locked->user_id ? User::whereKey($locked->user_id)->lockForUpdate()->first() : null;
            $plan = $locked->plan_id ? Plan::find($locked->plan_id) : null;

            if ($user === null || $plan === null) {
                $stop = true;

                return $this->flag($locked, 'Renewal paid, but the account or plan no longer exists. Refund it in lava.top.');
            }

            $applied = PlanTerm::apply($user, $plan, $locked->term());

            if (is_string($applied)) {
                $stop = true;

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
            $outcome->notify(new LavaMembershipRenewed($payment, $membership->fresh()->isActive()));
            $this->telegram->lavaPaymentGranted($payment);
        } elseif ($outcome === 'flagged') {
            $note = '';

            if ($stop) {
                $note = $this->stopCharges($membership->contract_id, $membership->email)
                    ? ' We cancelled the monthly plan with lava.top.'
                    : ' lava.top could not be reached: cancel the monthly plan in lava.top by hand, or it keeps charging.';

                if ($membership->fresh()->isActive()) {
                    $membership->forceFill(['status' => LavaMembership::STATUS_CANCELLED, 'cancelled_at' => now()])->save();
                }
            }

            $this->telegram->lavaNeedsReview('Renewal needs review', $payment->review_reason.$note, $payment->email);
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
            // Cancelled (from lava.top's email) before its first charge reached
            // us: record it cancelled now, so the grant that follows doesn't
            // start it as renewing.
            $first = $contractId === '' ? null : LavaPayment::where('contract_id', $contractId)
                ->where('kind', LavaPayment::KIND_MEMBERSHIP)
                ->whereNotNull('user_id')
                ->first();

            if ($first === null) {
                Log::info('lava.top cancelled a membership we do not know', ['contract_id' => $contractId]);

                return;
            }

            LavaMembership::firstOrCreate(['contract_id' => $contractId], [
                'user_id' => $first->user_id,
                'plan_id' => $first->plan_id,
                'email' => $first->email,
                'status' => LavaMembership::STATUS_CANCELLED,
                'cancelled_at' => self::date($data['cancelledAt'] ?? null) ?? now(),
                'ends_at' => self::date($data['willExpireAt'] ?? null),
                'payload' => $data,
            ]);

            return;
        }

        if (! $membership->isActive()) {
            // Cancelled from our Account page first: keep that, but record the
            // end date lava.top now reports, which only this notice carries.
            $endsAt = self::date($data['willExpireAt'] ?? null);

            if ($membership->ends_at === null && $endsAt !== null) {
                $membership->forceFill(['ends_at' => $endsAt, 'payload' => $data])->save();
            }

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

        $chargeback = $status === LavaPayment::STATUS_CHARGEBACK;
        $refundId = (string) ($body['refund_id'] ?? $data['event_id'] ?? '');
        $amount = round((float) ($body['amount'] ?? 0), 2);
        $fullRefund = ($body['refund_type'] ?? 'full') === 'full';

        if ($payment === null) {
            // A partial refund leaves the charge standing: no placeholder that
            // would make its late renewal notice grant nothing.
            if ($contractId !== '' && ($chargeback || $fullRefund)) {
                // Most likely a renewal whose own webhook hasn't arrived yet
                // (lava.top is still retrying it). Recorded as reversed, so
                // when it does arrive it finds this row and grants nothing.
                LavaPayment::createOrFirst(['contract_id' => $contractId], [
                    'kind' => LavaPayment::KIND_RENEWAL,
                    'product_name' => mb_substr((string) ($body['product']['product_name'] ?? 'Unknown lava.top charge'), 0, 80),
                    'list_price_usd' => (float) ($body['amount'] ?? 0),
                    'amount_usd' => (float) ($body['amount'] ?? 0),
                    'email' => (string) ($body['customer_email'] ?? ''),
                    'status' => $status,
                    'review_reason' => "{$what} on lava.top for a charge we had not seen yet. Nothing was granted for it.",
                    'payload' => $data,
                ]);
            }

            $this->telegram->lavaNeedsReview(
                ($chargeback || $fullRefund ? $what : 'Partial refund').' for a payment we do not know',
                "lava.top charge {$contractId}, \$".($body['amount'] ?? '?').'.',
                $body['customer_email'] ?? null,
            );

            return;
        }

        $outcome = DB::transaction(function () use ($payment, $chargeback, $refundId, $amount, $fullRefund, $what) {
            /** @var LavaPayment $locked */
            $locked = LavaPayment::whereKey($payment->id)->lockForUpdate()->first();

            if ($chargeback) {
                if ($locked->status === LavaPayment::STATUS_CHARGEBACK) {
                    return null;
                }

                $locked->status = LavaPayment::STATUS_CHARGEBACK;
            } else {
                // Each refund once, by lava.top's id: a partial refund and a
                // later full one are two events, a redelivery is not.
                $refunds = $locked->refunds ?? [];

                if ($refundId === '' ? $locked->status === LavaPayment::STATUS_REFUNDED : in_array($refundId, array_column($refunds, 'id'), true)) {
                    return null;
                }

                $charged = (float) $locked->amount_usd;
                $total = $fullRefund ? $charged : min($charged, (float) $locked->refunded_usd + $amount);
                $refunds[] = ['id' => $refundId, 'type' => $fullRefund ? 'full' : 'partial', 'amount' => $amount, 'at' => now()->toIso8601String()];

                $locked->refunds = $refunds;
                $locked->refunded_usd = number_format($total, 2, '.', '');

                // A partial refund leaves the charge paid: its term, its
                // reminders and the rest of its revenue still stand.
                if ($total < $charged - 0.009) {
                    $locked->save();

                    return 'partial';
                }

                if ($locked->status !== LavaPayment::STATUS_CHARGEBACK) {
                    $locked->status = LavaPayment::STATUS_REFUNDED;
                }
            }

            $locked->review_reason = $locked->granted_at !== null
                ? "{$what} on lava.top. Pro was left on; take it away by hand if they should lose it."
                : "{$what} on lava.top. Pro was never granted for this payment.";
            $locked->save();

            return 'reversed';
        });

        if ($outcome === null) {
            return;
        }

        $payment->refresh();

        if ($outcome === 'partial') {
            $this->telegram->lavaNeedsReview(
                "Partial refund: {$payment->product_name}",
                "\${$amount} refunded of \${$payment->amount_usd} (\${$payment->refunded_usd} in all). Pro and any monthly plan were left as they are.",
                $payment->email,
            );

            return;
        }

        if (($body['subscription_cancelled'] ?? false) === true) {
            $this->membershipCancelled(['contractId' => $contractId]);
        }

        $note = $this->stopAfterReversal($payment, $what);

        $this->telegram->lavaNeedsReview("{$what}: {$payment->product_name}", $payment->review_reason.$note, $payment->email);
    }

    /**
     * A charge of a monthly plan was charged back or refunded in full: stop
     * the plan, or lava.top bills the account again next month and the
     * renewal hands Pro back. Returns the line the admin alert ends with.
     */
    private function stopAfterReversal(LavaPayment $payment, string $what): string
    {
        $membership = $payment->membership;

        if ($membership === null && $payment->kind === LavaPayment::KIND_MEMBERSHIP) {
            // The first charge was never granted (its notice never got through),
            // so no membership row exists, but lava.top still bills monthly.
            return $this->stopCharges($payment->contract_id, $payment->email)
                ? ' We cancelled the monthly plan with lava.top.'
                : ' lava.top could not be reached: cancel the monthly plan in lava.top by hand, or it keeps charging.';
        }

        if ($membership === null || $membership->stopped_reason !== null) {
            return '';
        }

        $wasActive = $membership->isActive();
        $stopped = ! $wasActive || $this->stopCharges($membership->contract_id, $membership->email);

        // Cancelled here even when lava.top could not be reached: we don't
        // want the plan, so the account must not show it as renewing. A
        // renewal that still lands is held for review by stopped_reason.
        $membership->forceFill([
            'stopped_reason' => strtolower($what)." of charge {$payment->contract_id}",
            'status' => LavaMembership::STATUS_CANCELLED,
            'cancelled_at' => $membership->cancelled_at ?? now(),
        ])->save();

        return match (true) {
            ! $wasActive => '',
            $stopped => ' We cancelled the monthly plan with lava.top.',
            default => ' lava.top could not be reached: cancel the monthly plan in lava.top by hand, or it keeps charging.',
        };
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

    private static function isReversed(LavaPayment $payment): bool
    {
        return in_array($payment->status, [LavaPayment::STATUS_REFUNDED, LavaPayment::STATUS_CHARGEBACK], true);
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
