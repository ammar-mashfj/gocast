<?php

namespace App\Services\Billing;

use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Services\AdminTelegram;
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
 * - A refund flags the payment for review. Nothing takes Pro away by
 *   itself; that stays a decision (Revoke), as with OxaPay.
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

            $this->processor->process([
                'track_id' => $linkId,
                'order_id' => $data['reference'] ?? $payment->uuid,
                'status' => Payment::STATUS_PAID,
                'getly' => $data,
            ], 'webhook');

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
     * `order.refunded`: every payment that came from that Getly order.
     *
     * @param  array<string, mixed>  $data
     */
    public function refunded(array $data): void
    {
        $orderId = (string) ($data['orderId'] ?? '');

        $payments = $orderId === '' ? collect() : Payment::where('provider', 'getly')
            ->where('payload->getly->orderId', $orderId)
            ->get();

        if ($payments->isEmpty()) {
            $this->telegram->opsAlert(
                'getly-refund:'.$orderId,
                "⚠️ <b>Getly refund for an order we have no payment for</b>\nOrder {$this->e($orderId)}. Check it in Getly.",
                quietMinutes: 60 * 24,
            );

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
        $paidCents = (int) ($item['price'] ?? $product->priceCents());
        $trackId = 'order:'.($item['orderItemId'] ?? $orderId);

        [$payment, $created] = DB::transaction(function () use ($trackId, $product, $user, $paidCents, $sale) {
            $existing = Payment::where('track_id', $trackId)->lockForUpdate()->first();

            if ($existing !== null) {
                return [$existing, false];
            }

            $listCents = $product->priceCents();

            return [Payment::create([
                'user_id' => $user?->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'grant_type' => $product->grant_type,
                'plan_id' => $product->plan_id,
                'duration_unit' => $product->duration_unit,
                'duration_count' => $product->duration_count,
                'list_price_usd' => number_format($listCents / 100, 2, '.', ''),
                'discount_usd' => number_format(max(0, $listCents - $paidCents) / 100, 2, '.', ''),
                'amount_usd' => number_format($paidCents / 100, 2, '.', ''),
                'provider' => 'getly',
                'sandbox' => false,
                'track_id' => $trackId,
                'status' => Payment::STATUS_NEW,
                'payload' => ['getly' => $sale],
            ]), true];
        });

        if ($user === null) {
            if ($created) {
                $payment->forceFill([
                    'status' => Payment::STATUS_PAID,
                    'paid_at' => now(),
                    'review_reason' => "Paid on Getly with {$email}, but no GoCast account uses that email. Grant it by hand from Stations.",
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
