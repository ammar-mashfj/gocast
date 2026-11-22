<?php

namespace App\Services\Billing;

use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Services\AdminTelegram;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * What Getly's webhooks mean for our payments.
 *
 * - A sale from one of our checkout links names the link and carries our
 *   payment uuid as `reference`: it goes to PaymentProcessor as `paid`,
 *   exactly like an OxaPay webhook, and Pro is granted under its lock.
 * - A sale made on Getly's own product page (no link) has no payment row
 *   yet. One is made per item, matched to the account by the email they
 *   paid with, and then processed the same way. No account with that email
 *   means a payment row that says so, and an alert, never a guess.
 * - A refund or a dispute flags the payment for review. Nothing takes Pro
 *   away by itself; that stays a decision (Revoke), as with OxaPay.
 *
 * Getly's own data rides along under `getly` in the payload, so a payment
 * can be found again by Getly order id when the refund arrives.
 */
class GetlySales
{
    public function __construct(
        private readonly PaymentProcessor $processor,
        private readonly AdminTelegram $telegram,
    ) {}

    /**
     * `sale.completed` and `checkout_link.completed`. A link sale sends both;
     * the second is a no-op because the grant is once-only.
     *
     * @param  array<string, mixed>  $data
     */
    public function completed(array $data): void
    {
        $linkId = (string) ($data['checkoutLinkId'] ?? '');

        if ($linkId !== '') {
            $payment = Payment::where('provider', 'getly')->where('track_id', $linkId)->first();

            if ($payment === null) {
                // A link minted somewhere else (staging, by hand in Getly).
                // Real money, so a human looks; matching by email here could
                // grant the wrong environment's account.
                Log::warning('Getly sale for a checkout link we never made', ['link' => $linkId, 'order' => $data['orderId'] ?? null]);
                $this->telegram->opsAlert(
                    'getly-unknown-link:'.$linkId,
                    "⚠️ <b>Getly sale for an unknown checkout link</b>\nLink {$this->e($linkId)}, order {$this->e((string) ($data['orderId'] ?? '?'))}\n"
                    .$this->e((string) ($data['buyerEmail'] ?? 'no email')).'. Nothing was granted.',
                    quietMinutes: 60 * 24,
                );

                return;
            }

            $this->linkSale($payment, $data);

            return;
        }

        // checkout_link.completed always has a link id; only a store-page
        // sale.completed gets here.
        foreach ((array) ($data['items'] ?? []) as $item) {
            if (is_array($item)) {
                $this->storeSale($data, $item);
            }
        }
    }

    /**
     * `order.refunded`: the payments for the refunded items of that order.
     *
     * @param  array<string, mixed>  $data
     */
    public function refunded(array $data, ?string $deliveryId = null): void
    {
        $orderId = (string) ($data['orderId'] ?? '');
        $payments = $this->paymentsFor($orderId, (array) ($data['orderItemIds'] ?? []));

        if ($payments->isEmpty()) {
            $this->extraOrderRefunded($orderId) || $this->unknownOrder('refund', $orderId);

            return;
        }

        // Getly refunds per order. Each payment's share is plain when one of
        // ours was refunded, or when all of them were refunded in full; a
        // partial refund across several items can't be split, so each gets
        // a note and keeps its status.
        $refunded = isset($data['amountCents']) ? (int) $data['amountCents'] : null;
        $cents = fn (Payment $payment) => (int) round(((float) $payment->amount_usd) * 100);
        $ofAll = $payments->sum($cents);

        foreach ($payments as $payment) {
            [$share, $note] = match (true) {
                $refunded === null => [null, null],
                $payments->count() === 1 => [min($refunded, $cents($payment)), 'Refunded $'.PaymentProcessor::money($refunded).' of $'.$payment->amount_usd.'.'],
                $refunded >= $ofAll => [$cents($payment), 'Refunded in full, with the rest of order '.$orderId.'.'],
                default => [0, 'Getly refunded $'.PaymentProcessor::money($refunded).' of order '.$orderId.' ($'.PaymentProcessor::money($ofAll).' across '.$payments->count().' items); check on Getly which.'],
            };

            $this->processor->process(array_filter([
                'track_id' => $payment->track_id,
                'order_id' => $payment->uuid,
                'status' => Payment::STATUS_REFUNDED,
                // Each refund of an order arrives as its own delivery; a
                // retry of one reuses its id, a second partial refund doesn't.
                'refund_key' => $deliveryId ?? md5((string) json_encode($data)),
                'refunded_cents' => $share,
                'note' => $note,
                'getly' => $data,
            ], fn ($value) => $value !== null), 'webhook');
        }
    }

    /**
     * `dispute.created`: a card chargeback (or a buyer complaint) was
     * opened. Flagged like a refund, and like a refund nothing is taken
     * away by itself: the dispute may still go our way.
     *
     * @param  array<string, mixed>  $data
     */
    public function disputed(array $data): void
    {
        $orderId = (string) ($data['orderId'] ?? '');
        $itemId = $data['orderItemId'] ?? null;
        $payments = $this->paymentsFor($orderId, $itemId === null ? [] : [$itemId]);

        $reason = trim((string) ($data['reason'] ?? ''));

        if ($payments->isEmpty()) {
            $extra = $this->paymentWithExtraOrder($orderId);

            if ($extra === null) {
                $this->unknownOrder('dispute', $orderId);
            } else {
                $this->processor->review($extra, "Dispute opened on Getly for the extra order {$orderId}".($reason !== '' ? " ({$reason})" : '').'. Nothing was granted for that order; answer it on Getly.');
            }

            return;
        }

        foreach ($payments as $payment) {
            $this->processor->review($payment, fn (Payment $locked) => 'Dispute opened on Getly'.($reason !== '' ? " ({$reason})" : '').'. '.(
                $locked->granted_at !== null
                    ? 'Pro was not taken away; answer it on Getly and revoke by hand if it is lost.'
                    : "Pro was never granted for it; answer it on Getly and don't grant it while it is open."
            ));
        }
    }

    /**
     * A sale from one of our links. The checks that need the payment's lock
     * (a second order on the same link, a charge that differs from our
     * quote) happen in PaymentProcessor.
     *
     * @param  array<string, mixed>  $data
     */
    private function linkSale(Payment $payment, array $data): void
    {
        $charged = $data['total'] ?? $data['amountCents'] ?? null;

        $this->processor->process(array_filter([
            'track_id' => $payment->track_id,
            'order_id' => $data['reference'] ?? $payment->uuid,
            'status' => Payment::STATUS_PAID,
            'charged_cents' => $charged === null ? null : (int) $charged,
            'getly' => $data,
        ], fn ($value) => $value !== null), 'webhook');
    }

    /**
     * Getly payments from $orderId, narrowed to $itemIds when given. A
     * payment whose item ids we don't know (a link sale seen only through
     * reconcile) counts as part of the whole order.
     *
     * @param  array<int, mixed>  $itemIds
     * @return Collection<int, Payment>
     */
    private function paymentsFor(string $orderId, array $itemIds): Collection
    {
        if ($orderId === '') {
            return new Collection;
        }

        $wanted = array_map('strval', array_filter($itemIds, fn ($id) => $id !== null && $id !== ''));

        return Payment::where('provider', 'getly')
            ->where('payload->getly->orderId', $orderId)
            ->get()
            ->filter(function (Payment $payment) use ($wanted) {
                if ($wanted === []) {
                    return true;
                }

                $known = self::itemIdsOf($payment);

                return $known === [] || array_intersect($known, $wanted) !== [];
            })
            ->values();
    }

    /**
     * @return list<string>
     */
    private static function itemIdsOf(Payment $payment): array
    {
        // A store-page payment is one item of its order: the track id says
        // which, while its payload lists every item in the order.
        if (str_starts_with((string) $payment->track_id, 'order:')) {
            return [substr((string) $payment->track_id, 6)];
        }

        $getly = (array) data_get($payment->payload, 'getly', []);
        $ids = array_merge(
            array_column(array_filter((array) ($getly['items'] ?? []), 'is_array'), 'orderItemId'),
            (array) ($getly['orderItemIds'] ?? []),
            isset($getly['orderItemId']) ? [$getly['orderItemId']] : [],
        );

        return array_values(array_unique(array_map('strval', $ids)));
    }

    /**
     * The refund of a second order paid on one of our links, which the
     * payment's note told the admin to make. Noted on that payment, quietly:
     * it is the expected end of that story, not a fault.
     */
    private function extraOrderRefunded(string $orderId): bool
    {
        $payment = $this->paymentWithExtraOrder($orderId);

        if ($payment === null) {
            return false;
        }

        $this->processor->review($payment, "The extra Getly order {$orderId} was refunded.", alert: false);

        return true;
    }

    /**
     * The payment whose link a second order ($orderId) was paid on.
     */
    private function paymentWithExtraOrder(string $orderId): ?Payment
    {
        return $orderId === '' ? null : Payment::where('provider', 'getly')
            ->whereJsonContains('payload->extra_orders', $orderId)
            ->first();
    }

    private function unknownOrder(string $what, string $orderId): void
    {
        $this->telegram->opsAlert(
            "getly-{$what}:{$orderId}",
            "⚠️ <b>Getly {$what} for an order we have no payment for</b>\nOrder {$this->e($orderId)}. Check it in Getly.",
            quietMinutes: 60 * 24,
        );
    }

    /**
     * @param  array<string, mixed>  $sale
     * @param  array<string, mixed>  $item
     */
    private function storeSale(array $sale, array $item): void
    {
        $orderId = (string) ($sale['orderId'] ?? '');
        $getlyProduct = (string) ($item['productId'] ?? '');
        $slug = array_search($getlyProduct, (array) config('services.getly.products'), true);
        $product = is_string($slug) ? Product::with('plan')->where('slug', $slug)->first() : null;

        if ($product === null) {
            // Something else in the store, or a product not mapped yet.
            Log::info('Getly sale for a product we do not grant', ['product' => $getlyProduct, 'order' => $orderId]);

            return;
        }

        $email = strtolower(trim((string) ($sale['buyerEmail'] ?? '')));
        $user = $email === '' ? null : User::whereRaw('LOWER(email) = ?', [$email])->first();

        // Why a human has to grant this one, or null to grant it now. A gift's
        // buyerEmail is the giver's (Getly doesn't share the recipient), and an
        // unverified address could belong to someone who never owned it.
        $reason = match (true) {
            (bool) ($item['isGift'] ?? false) => "Bought on Getly as a gift by {$email}; Getly doesn't share who it is for. Grant it by hand once they tell you.",
            $user === null => "Paid on Getly with {$email}, but no GoCast account uses that email. Grant it by hand from Stations.",
            $user->email_verified_at === null => "Paid on Getly with {$email}, which matches an account that hasn't verified its email. Check, then grant it by hand.",
            default => null,
        };
        $paidCents = (int) ($item['price'] ?? $product->priceCents());
        $trackId = 'order:'.($item['orderItemId'] ?? $orderId);

        // Written with the payment row in one insert, so a crash can't leave
        // a held sale looking like an ordinary unprocessed one.
        $reason = $reason === null ? null : Str::limit($reason, 250);

        [$payment, $created] = DB::transaction(function () use ($trackId, $product, $user, $paidCents, $sale, $item, $reason) {
            $existing = Payment::where('track_id', $trackId)->lockForUpdate()->first();

            if ($existing !== null) {
                return [$existing, false];
            }

            $listCents = $product->priceCents();

            return [Payment::create([
                'user_id' => ($item['isGift'] ?? false) ? null : $user?->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'grant_type' => $product->grant_type,
                'plan_id' => $product->plan_id,
                'duration_unit' => $product->duration_unit,
                'duration_count' => $product->duration_count,
                'list_price_usd' => PaymentProcessor::money($listCents),
                'discount_usd' => PaymentProcessor::money(max(0, $listCents - $paidCents)),
                'amount_usd' => PaymentProcessor::money($paidCents),
                'provider' => 'getly',
                'sandbox' => false,
                'track_id' => $trackId,
                'status' => $reason === null ? Payment::STATUS_NEW : Payment::STATUS_PAID,
                'paid_at' => $reason === null ? null : now(),
                'review_reason' => $reason,
                'payload' => ['getly' => $sale],
            ]), true];
        });

        // A sale seen before is only picked up again if it never got past
        // `new` (we crashed between the insert and the grant). Anything else
        // is a retry: a held sale whose review was cleared, or one already
        // granted by hand, must not be granted by Getly redelivering it.
        if (! $created && $payment->status !== Payment::STATUS_NEW) {
            return;
        }

        if ($payment->review_reason !== null) {
            $this->telegram->paymentNeedsReview($payment);

            return;
        }

        $this->processor->process([
            'track_id' => $trackId,
            'order_id' => $payment->uuid,
            'status' => Payment::STATUS_PAID,
            'getly' => $sale,
        ], 'webhook');
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
