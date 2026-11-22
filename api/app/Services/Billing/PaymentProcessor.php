<?php

namespace App\Services\Billing;

use App\Models\Discount;
use App\Models\Payment;
use App\Models\User;
use App\Services\AdminTelegram;
use App\Services\Billing\Grants\GrantResult;
use App\Services\Billing\Grants\Grants;
use Closure;
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
     *                                      Getly adds `getly` (its own data), `charged_cents` (what the
     *                                      buyer actually paid), `refund_key` (one per refund delivery) and
     *                                      `note` (extra words for a refund's flag).
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

        $outcome = DB::transaction(function () use ($payment, $data) {
            /** @var Payment $locked */
            $locked = Payment::whereKey($payment->id)->lockForUpdate()->first();

            return $this->apply($locked, $data);
        });

        $fresh = $payment->fresh();

        if ($outcome['granted'] !== null) {
            [$user, $result] = $outcome['granted'];
            Grants::for($fresh->grant_type)->notify($user, $fresh, $result);
            $this->telegram->paymentGranted($fresh);
        }

        if ($outcome['flagged']) {
            $this->telegram->paymentNeedsReview($fresh);
        }

        return $fresh;
    }

    /**
     * Add a note for a human to $payment without changing anything else about
     * it, and alert once per new note. For what the provider tells us outside
     * the status flow, like a dispute. $reason may be worked out from the
     * locked row, so it can say what really happened to the plan.
     *
     * @param  string|Closure(Payment): string  $reason
     */
    public function review(Payment $payment, string|Closure $reason, bool $alert = true): void
    {
        $flagged = DB::transaction(function () use ($payment, $reason) {
            /** @var Payment $locked */
            $locked = Payment::whereKey($payment->id)->lockForUpdate()->first();

            return $this->flag($locked, is_string($reason) ? $reason : $reason($locked));
        });

        if ($flagged && $alert) {
            $this->telegram->paymentNeedsReview($payment->fresh());
        }
    }

    /**
     * The state change itself, on the locked row.
     *
     * @param  array<string, mixed>  $data
     * @return array{granted: array{0: User, 1: GrantResult}|null, flagged: bool}
     */
    private function apply(Payment $locked, array $data): array
    {
        $none = ['granted' => null, 'flagged' => false];
        $flagged = fn (bool $isNew) => ['granted' => null, 'flagged' => $isNew];
        $provider = self::providerName($locked);
        $status = self::normalizeStatus($data['status'] ?? '');
        $orderId = (string) ($data['order_id'] ?? '');
        $note = isset($data['note']) ? ' '.trim((string) $data['note']) : '';
        $isRefund = in_array($status, [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED], true);
        $wasRefunded = in_array($locked->status, [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED], true);

        // The order id is ours (the uuid). A different one means this
        // track id is not the invoice we think it is; touch nothing else.
        if ($orderId !== '' && $orderId !== $locked->uuid) {
            return $flagged($this->flag($locked, "{$provider} sent order id {$orderId} for this payment's track id. Nothing was granted."));
        }

        if (! in_array($status, Payment::STATUSES, true) || $status === Payment::STATUS_FAILED) {
            $this->keepPayload($locked, $data, (array) data_get($locked->payload, 'refund_keys', []));

            return $flagged($this->flag($locked, "{$provider} sent an unknown status \"{$status}\". Nothing was changed."));
        }

        // Money that went back stays gone: a Getly link still reads
        // "completed" after a refund, and Recheck must not revive it.
        if ($wasRefunded && ! $isRefund) {
            return $none;
        }

        // Getly makes the payment session when the link is opened, so a link
        // open in two tabs can be paid twice. Only the first order is ours,
        // and only once one was accepted: an order id seen while the link
        // was still open (a reconcile poll) may be an abandoned session.
        $knownOrder = (string) data_get($locked->payload, 'getly.orderId', '');
        $thisOrder = (string) data_get($data, 'getly.orderId', '');
        $hasOrder = $locked->granted_at !== null || $locked->isSettled();

        if (! $isRefund && $hasOrder && $knownOrder !== '' && $thisOrder !== '' && $thisOrder !== $knownOrder) {
            $payload = (array) $locked->payload;
            $payload['extra_orders'] = array_values(array_unique([...(array) ($payload['extra_orders'] ?? []), $thisOrder]));
            $locked->payload = $payload;

            return $flagged($this->flag($locked, "A second Getly order ({$thisOrder}) was paid on this payment's link after order {$knownOrder}. Only one was granted; refund the extra one on Getly."));
        }

        // A refund is news once. Getly sends every refund of an order as
        // "refunded", so a second partial refund is told apart by its delivery.
        $old = (array) $locked->payload;
        $refundKeys = (array) ($old['refund_keys'] ?? []);

        if ($isRefund) {
            $key = isset($data['refund_key']) ? (string) $data['refund_key'] : null;

            if ($key !== null ? in_array($key, $refundKeys, true) : $status === $locked->status) {
                return $none;
            }

            if ($key !== null) {
                $refundKeys[] = $key;
            }
        }

        $this->keepPayload($locked, $data, $refundKeys);

        if ($isRefund && isset($data['refunded_cents'])) {
            // Getly says how much went back. Less than was paid is a partial
            // refund: noted, but the payment stays paid (revenue, renewal
            // reminders), and a held sale keeps its "grant it by hand".
            $total = (int) ($old['refunded_cents'] ?? 0) + (int) $data['refunded_cents'];
            $locked->payload = [...(array) $locked->payload, 'refunded_cents' => $total];

            if ($total < (int) round(((float) $locked->amount_usd) * 100) && ! $wasRefunded) {
                return $flagged($this->flag($locked, "Partly refunded on {$provider}.{$note}".($locked->granted_at !== null ? ' Pro was kept.' : '')));
            }
        }

        if ($locked->granted_at !== null) {
            if ($isRefund) {
                $locked->status = $status;

                return $flagged($this->flag($locked, "Refunded on {$provider} after the plan was granted.{$note} Revoke it by hand if they should lose it."));
            }

            // Already granted (reconcile or Recheck can get there before the
            // sale webhook). A late "paying" or a redelivered "paid" must not
            // move the status backwards, but the first word of what the buyer
            // was actually charged is still checked, and kept.
            if (! isset($data['charged_cents']) || isset($old['charged_cents'])) {
                return $none;
            }

            $priceNote = $this->takeChargedAmount($locked, $data);

            if ($priceNote === null) {
                $locked->save();

                return $none;
            }

            return $flagged($this->flag($locked, $priceNote.' Pro was granted; check the price or coupon on Getly.'));
        }

        // A refund means money had come in, but the plan was never granted
        // here: it may have been granted by hand, which leaves no trace on
        // the payment, so it always needs a human. A held note ("grant it by
        // hand") is replaced, since it is now wrong.
        $wasHeld = $locked->review_reason !== null;
        $locked->status = $status;

        if ($isRefund) {
            return $flagged($this->flag($locked, "Refunded on {$provider} before it was granted.{$note} Don't grant it, and if you already granted Pro by hand, revoke it.", replace: $wasHeld && ! $wasRefunded));
        }

        if ($status === Payment::STATUS_UNDERPAID) {
            return $flagged($this->flag($locked, 'Underpaid. Accept it in the OxaPay panel to grant the plan automatically, or refund it.'));
        }

        if (! $locked->isSettled()) {
            $locked->save();

            return $none;
        }

        $locked->paid_at ??= now();
        $priceNote = $this->takeChargedAmount($locked, $data);

        // withTrashed is not used: a closed account is not somebody to
        // upgrade, and the money needs a human either way.
        $user = $locked->user_id ? User::whereKey($locked->user_id)->lockForUpdate()->first() : null;
        $result = $user === null
            ? "Paid, but the account has been deleted. Refund it on {$provider}."
            : Grants::for($locked->grant_type)->apply($locked, $user);

        if (is_string($result)) {
            $isNew = $this->flag($locked, $result);

            if ($priceNote !== null) {
                $isNew = $this->flag($locked, $priceNote.' Nothing was granted.') || $isNew;
            }

            return $flagged($isNew);
        }

        $locked->granted_at = now();
        $locked->granted_until = $result->until;
        $locked->review_reason = null;
        $locked->save();

        if ($locked->discount_id !== null) {
            Discount::whereKey($locked->discount_id)->increment('redemptions_count');
        }

        return [
            'granted' => [$user, $result],
            'flagged' => $priceNote !== null && $this->flag($locked, $priceNote.' Pro was granted; check the price or coupon on Getly.'),
        ];
    }

    /**
     * What the buyer actually paid replaces our quote before the grant, since
     * a prorated refund is worked out from it. Returns the note to flag when
     * the two differ.
     *
     * @param  array<string, mixed>  $data
     */
    private function takeChargedAmount(Payment $locked, array $data): ?string
    {
        if (! isset($data['charged_cents'])) {
            return null;
        }

        $charged = (int) $data['charged_cents'];
        $quoted = (int) round(((float) $locked->amount_usd) * 100);

        if ($charged === $quoted) {
            return null;
        }

        $list = (int) round(((float) $locked->list_price_usd) * 100);
        $locked->amount_usd = self::money($charged);
        $locked->discount_usd = self::money(max(0, $list - $charged));

        return self::providerName($locked).' charged $'.self::money($charged).' but checkout quoted $'.self::money($quoted).'.';
    }

    /**
     * The provider's latest word becomes the payload, keeping what we
     * remember across deliveries: Getly's sale details (items and order,
     * which refunds and disputes are matched on) are merged rather than
     * replaced by a later link lookup, and our own bookkeeping carries over.
     *
     * @param  array<string, mixed>  $data
     * @param  list<string>  $refundKeys
     */
    private function keepPayload(Payment $locked, array $data, array $refundKeys): void
    {
        $old = (array) $locked->payload;
        unset($data['refund_key'], $data['note'], $data['refunded_cents']);

        if (isset($old['getly']) && isset($data['getly'])) {
            $data['getly'] = array_merge((array) $old['getly'], (array) $data['getly']);
        }

        foreach (['getly', 'extra_orders', 'refunded_cents', 'charged_cents'] as $kept) {
            if (isset($old[$kept]) && ! isset($data[$kept])) {
                $data[$kept] = $old[$kept];
            }
        }

        if ($refundKeys !== []) {
            $data['refund_keys'] = array_values(array_unique($refundKeys));
        }

        $locked->payload = $data;
    }

    public static function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    public static function providerName(Payment $payment): string
    {
        return self::nameOf((string) $payment->provider);
    }

    public static function nameOf(string $provider): string
    {
        return match ($provider) {
            'getly' => 'Getly',
            'oxapay' => 'OxaPay',
            default => ucfirst($provider),
        };
    }

    /**
     * Add $reason to the payment's note for a human, keeping what is already
     * there (each reason on its own line), and save. A reason it already
     * holds (a redelivered webhook) is not news. $replace drops the old note,
     * for when the new one makes it wrong ("grant it by hand" → "don't").
     *
     * @return bool Whether the note changed, i.e. whether to alert.
     */
    private function flag(Payment $payment, string $reason, bool $replace = false): bool
    {
        $reason = Str::limit($reason, 500);
        $current = $payment->review_reason;
        $isNew = $current === null || $replace ? $current !== $reason : ! str_contains($current, $reason);

        if ($isNew) {
            $payment->review_reason = $current === null || $replace ? $reason : $current."\n".$reason;
        }

        $payment->save();

        return $isNew;
    }
}
