<?php

namespace App\Services\Billing;

use App\Models\Discount;
use App\Models\Payment;
use App\Models\User;
use App\Services\AdminTelegram;
use App\Services\Billing\Grants\GrantResult;
use App\Services\Billing\Grants\Grants;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Applies what the provider says about a payment to our payment row — from
 * the OxaPay and Getly webhooks, from billing:reconcile, and from
 * billing:simulate. One code path, so a missed webhook caught by reconcile
 * grants exactly like the webhook would have.
 *
 * `$data` is OxaPay's shape (`track_id`, `order_id`, `status`);
 * GetlyWebhookController and GetlyGateway translate Getly's into it.
 *
 * Idempotent: providers redeliver and reconcile may ask about a payment the
 * webhook already settled. The grant happens under the
 * payment's row lock and only while `granted_at` is null.
 *
 * Nothing here takes Pro away. A refund after a grant, an underpaid invoice
 * or a paid invoice that cannot be granted only sets `review_reason` and
 * alerts the admin — taking a plan back is a decision, made with Revoke.
 */
class PaymentProcessor
{
    public function __construct(private readonly AdminTelegram $telegram) {}

    /**
     * OxaPay sends "Paid" in webhooks and "paid" in its docs table, and
     * "Manual Accept" may come either way, so compare one spelling.
     */
    public static function normalizeStatus(mixed $status): string
    {
        return str_replace([' ', '-'], '_', strtolower(trim((string) $status)));
    }

    /**
     * @param  array<string, mixed>  $data  A webhook body or a paymentInfo() answer.
     * @return Payment|null The payment it was about, or null for a track id we never issued.
     */
    public function process(array $data, string $source): ?Payment
    {
        $trackId = (string) ($data['track_id'] ?? '');
        $payment = $trackId === '' ? null : Payment::where('track_id', $trackId)->first();

        if ($payment === null) {
            // Another environment's sandbox invoice, or a payment link made by
            // hand in the OxaPay panel. Acknowledged, never acted on.
            Log::info('Payment update for an unknown track id', ['track_id' => $trackId, 'source' => $source]);

            return null;
        }

        $status = self::normalizeStatus($data['status'] ?? '');
        $orderId = (string) ($data['order_id'] ?? '');

        $outcome = DB::transaction(function () use ($payment, $data, $status, $orderId) {
            /** @var Payment $locked */
            $locked = Payment::whereKey($payment->id)->lockForUpdate()->first();

            // The order id is ours (the uuid). A different one means this
            // track id is not the invoice we think it is; touch nothing else.
            if ($orderId !== '' && $orderId !== $locked->uuid) {
                return $this->flag($locked, self::providerName($locked)." sent order id {$orderId} for this payment's track id. Nothing was granted.");
            }

            if (! in_array($status, Payment::STATUSES, true) || $status === Payment::STATUS_FAILED) {
                $locked->payload = $data;

                return $this->flag($locked, self::providerName($locked)." sent an unknown status \"{$status}\". Nothing was changed.");
            }

            if ($locked->granted_at !== null) {
                // Already granted. Only a refund is news; a late "paying" or a
                // redelivered "paid" must not move the status backwards.
                if (! in_array($status, [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED], true) || $status === $locked->status) {
                    return null;
                }

                $locked->status = $status;
                $locked->payload = $data;

                return $this->flag($locked, 'Refunded on '.self::providerName($locked).' after the plan was granted. Revoke it by hand if they should lose it.');
            }

            $locked->status = $status;
            $locked->payload = $data;

            if ($status === Payment::STATUS_UNDERPAID) {
                return $this->flag($locked, 'Underpaid. Accept it in the OxaPay panel to grant the plan automatically, or refund it.');
            }

            if (! $locked->isSettled()) {
                $locked->save();

                return null;
            }

            $locked->paid_at ??= now();

            // withTrashed is not used: a closed account is not somebody to
            // upgrade, and the money needs a human either way.
            $user = $locked->user_id ? User::whereKey($locked->user_id)->lockForUpdate()->first() : null;

            if ($user === null) {
                return $this->flag($locked, 'Paid, but the account has been deleted. Refund it on '.self::providerName($locked).'.');
            }

            $grant = Grants::for($locked->grant_type);
            $result = $grant->apply($locked, $user);

            if (is_string($result)) {
                return $this->flag($locked, $result);
            }

            $locked->granted_at = now();
            $locked->granted_until = $result->until;
            $locked->review_reason = null;
            $locked->save();

            if ($locked->discount_id !== null) {
                Discount::whereKey($locked->discount_id)->increment('redemptions_count');
            }

            return [$user, $result];
        });

        $fresh = $payment->fresh();

        if (is_array($outcome)) {
            /** @var array{0: User, 1: GrantResult} $outcome */
            [$user, $result] = $outcome;
            Grants::for($fresh->grant_type)->notify($user, $fresh, $result);
            $this->telegram->paymentGranted($fresh);
        } elseif ($outcome === 'flagged') {
            $this->telegram->paymentNeedsReview($fresh);
        }

        return $fresh;
    }

    /**
     * Flag $payment for a human without changing anything else about it, and
     * alert once per new reason. For what the provider tells us outside the
     * status flow: a second order on one link, a charge that differs from
     * the quote, a dispute.
     */
    public function review(Payment $payment, string $reason): void
    {
        $outcome = DB::transaction(function () use ($payment, $reason) {
            /** @var Payment $locked */
            $locked = Payment::whereKey($payment->id)->lockForUpdate()->first();

            return $this->flag($locked, Str::limit($reason, 250));
        });

        if ($outcome === 'flagged') {
            $this->telegram->paymentNeedsReview($payment->fresh());
        }
    }

    public static function providerName(Payment $payment): string
    {
        return match ($payment->provider) {
            'getly' => 'Getly',
            'oxapay' => 'OxaPay',
            default => ucfirst($payment->provider),
        };
    }

    /**
     * Record why a human needs to look, once. Re-flagging with the same
     * reason (a redelivered webhook) saves but does not alert again.
     */
    private function flag(Payment $payment, string $reason): ?string
    {
        $isNew = $payment->review_reason !== $reason;
        $payment->review_reason = $reason;
        $payment->save();

        return $isNew ? 'flagged' : null;
    }
}
