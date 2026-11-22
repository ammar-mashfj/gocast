<?php

namespace App\Services\Billing;

use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Services\AdminTelegram;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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
    public function refunded(array $data): void
    {
        $orderId = (string) ($data['orderId'] ?? '');
        $payments = $this->paymentsFor($orderId, (array) ($data['orderItemIds'] ?? []));

        if ($payments->isEmpty()) {
            $this->unknownOrder('refund', $orderId);

            return;
        }

        foreach ($payments as $payment) {
            $this->processor->process([
                'track_id' => $payment->track_id,
                'order_id' => $payment->uuid,
                'status' => Payment::STATUS_REFUNDED,
                'getly' => $data,
            ], 'webhook');
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

        if ($payments->isEmpty()) {
            $this->unknownOrder('dispute', $orderId);

            return;
        }

        $reason = trim((string) ($data['reason'] ?? ''));

        foreach ($payments as $payment) {
            $this->processor->review($payment, 'Dispute opened on Getly'.($reason !== '' ? " ({$reason})" : '').'. Pro was not taken away; answer it on Getly and revoke by hand if it is lost.');
        }
    }

    /**
     * A sale from one of our links. Getly creates the payment session only
     * when the link is opened, so a link opened in two tabs can be paid
     * twice: the second order is flagged, never silently kept. What Getly
     * actually charged replaces our quote, since that is what a prorated
     * refund is worked out from; a difference still grants, and is flagged.
     *
     * @param  array<string, mixed>  $data
     */
    private function linkSale(Payment $payment, array $data): void
    {
        $orderId = (string) ($data['orderId'] ?? '');
        $knownOrder = (string) data_get($payment->payload, 'getly.orderId', '');

        if ($orderId !== '' && $knownOrder !== '' && $orderId !== $knownOrder) {
            $this->processor->review($payment, "A second Getly order ({$orderId}) was paid on this payment's link after order {$knownOrder}. Only one was granted; refund the extra one on Getly.");

            return;
        }

        $charged = isset($data['total']) ? (int) $data['total'] : (isset($data['amountCents']) ? (int) $data['amountCents'] : null);
        $quoted = (int) round(((float) $payment->amount_usd) * 100);
        $differs = $charged !== null && $payment->granted_at === null && $charged !== $quoted;

        if ($differs) {
            $list = (int) round(((float) $payment->list_price_usd) * 100);
            $payment->forceFill([
                'amount_usd' => self::money($charged),
                'discount_usd' => self::money(max(0, $list - $charged)),
            ])->save();
        }

        $this->processor->process([
            'track_id' => $payment->track_id,
            'order_id' => $data['reference'] ?? $payment->uuid,
            'status' => Payment::STATUS_PAID,
            'getly' => $data,
        ], 'webhook');

        if ($differs) {
            $this->processor->review($payment, 'Getly charged $'.self::money($charged).' but checkout quoted $'.self::money($quoted).'. Pro was granted; check the price or coupon on Getly.');
        }
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

    private function unknownOrder(string $what, string $orderId): void
    {
        $this->telegram->opsAlert(
            "getly-{$what}:{$orderId}",
            "⚠️ <b>Getly {$what} for an order we have no payment for</b>\nOrder {$this->e($orderId)}. Check it in Getly.",
            quietMinutes: 60 * 24,
        );
    }

    private static function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
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

        [$payment, $created] = DB::transaction(function () use ($trackId, $product, $user, $paidCents, $sale, $item) {
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
                'list_price_usd' => self::money($listCents),
                'discount_usd' => self::money(max(0, $listCents - $paidCents)),
                'amount_usd' => self::money($paidCents),
                'provider' => 'getly',
                'sandbox' => false,
                'track_id' => $trackId,
                'status' => Payment::STATUS_NEW,
                'payload' => ['getly' => $sale],
            ]), true];
        });

        if ($reason !== null) {
            if ($created) {
                $payment->forceFill([
                    'status' => Payment::STATUS_PAID,
                    'paid_at' => now(),
                    'review_reason' => $reason,
                ])->save();
                $this->telegram->paymentNeedsReview($payment);
            }

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
