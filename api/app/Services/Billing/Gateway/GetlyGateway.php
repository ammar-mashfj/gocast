<?php

namespace App\Services\Billing\Gateway;

use App\Models\Payment;
use App\Models\Product;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Getly (getly.store): the buyer pays by card or USDT/USDC on Getly's page.
 *
 * Getly has no invoices. What it has is checkout links: one link per
 * payment, for the Getly product that sells that term (see
 * `services.getly.products`), carrying our payment uuid as `reference`.
 * Getly echoes the reference into its `sale.completed` webhook, which is
 * how GetlyWebhookController finds the payment, so the buyer's Getly email
 * doesn't have to match their GoCast one.
 *
 * The link id is the payment's `track_id`. paymentInfo() polls the link and
 * answers in the webhook's shape, so billing:reconcile grants a sale whose
 * webhook never arrived exactly as the webhook would have.
 *
 * Getly charges its own price for the product, not ours: the products are
 * kept at the same prices by hand, and a coupon is passed on by code, so the
 * same code has to exist on Getly with the same value.
 */
class GetlyGateway implements PaymentGateway
{
    /**
     * @param  array<string, string>  $products  Our product slug => Getly product id.
     */
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
        private readonly array $products,
        private readonly int $lifetimeHours,
    ) {}

    /** Whether $product has a Getly product to sell it through. */
    public function sells(Product $product): bool
    {
        return isset($this->products[$product->slug]);
    }

    public function createInvoice(Payment $payment, string $callbackUrl, string $returnUrl): Invoice
    {
        $slug = (string) $payment->product?->slug;
        $productId = $this->products[$slug] ?? null;

        if ($productId === null) {
            throw new GatewayException("No Getly product is mapped to \"{$slug}\" (services.getly.products).");
        }

        $body = array_filter([
            'productId' => $productId,
            'reference' => $payment->uuid,
            'couponCode' => $payment->discount_code,
            'metadata' => ['payment' => $payment->uuid],
            'expiresInHours' => max(1, min(720, $this->lifetimeHours)),
        ], fn ($value) => $value !== null);

        $data = $this->call(fn (PendingRequest $http) => $http
            ->withHeaders(['Idempotency-Key' => 'gocast-payment-'.$payment->uuid])
            ->post('checkout-links', $body));

        $id = (string) ($data['id'] ?? '');
        $url = (string) ($data['url'] ?? '');

        if ($id === '' || $url === '') {
            throw new GatewayException('Getly created a checkout link without an id or url.');
        }

        // Getly charges its own price, so the link is only handed out when it
        // is the price the dialog showed. A drift (a price edited on one side
        // only, a coupon Getly reads differently) stops here, before any
        // money moves, rather than being found after the sale.
        $charges = $data['discountedPriceCents'] ?? $data['priceCents'] ?? null;
        $quoted = (int) round(((float) $payment->amount_usd) * 100);

        if ($charges !== null && (int) $charges !== $quoted) {
            // With a coupon, the likely cause is Getly not taking it (used up
            // there, or read differently): say so, and the buyer can go on
            // without it.
            $couponNotTaken = $payment->discount_code !== null
                && (($data['couponApplied'] ?? null) === false || (int) $charges === (int) ($data['priceCents'] ?? -1));

            throw new GatewayException(
                sprintf(
                    'Getly would charge $%s for %s but checkout quoted $%s%s. Make the prices match on both sides.',
                    number_format(((int) $charges) / 100, 2),
                    $payment->product_name,
                    number_format($quoted / 100, 2),
                    $payment->discount_code ? " (coupon {$payment->discount_code})" : '',
                ),
                buyerMessage: $couponNotTaken
                    ? "That coupon can't be used right now. Remove it to pay the full price, or try again later."
                    : null,
            );
        }

        return new Invoice(
            trackId: $id,
            paymentUrl: $url,
            expiresAt: isset($data['expiresAt']) ? Carbon::parse((string) $data['expiresAt']) : null,
        );
    }

    /**
     * The link's state, shaped like what GetlyWebhookController hands the
     * processor: completed is paid, expired is expired, open is still new.
     */
    public function paymentInfo(string $trackId): array
    {
        $data = $this->call(fn (PendingRequest $http) => $http->get('checkout-links/'.rawurlencode($trackId)));

        return [
            'track_id' => $trackId,
            'order_id' => $data['reference'] ?? null,
            'status' => match ($data['status'] ?? null) {
                'completed' => Payment::STATUS_PAID,
                'expired' => Payment::STATUS_EXPIRED,
                default => Payment::STATUS_NEW,
            },
            'getly' => $data,
        ];
    }

    /**
     * The store's active coupons, keyed by upper-cased code: Getly is where
     * coupons for this checkout are made, so Pricing quotes from these
     * rather than from our own discounts table. Cached for a minute, since
     * every Apply in the dialog asks.
     *
     * @return array<string, array<string, mixed>>
     *
     * @throws GatewayException
     */
    public function coupons(): array
    {
        return Cache::remember('getly:coupons', 60, function () {
            $coupons = [];
            $cursor = null;

            for ($page = 0; $page < 10; $page++) {
                $data = $this->call(fn (PendingRequest $http) => $http->get('coupons', array_filter([
                    'active' => 'true',
                    'limit' => 100,
                    'cursor' => $cursor,
                ])));

                foreach ((array) ($data['items'] ?? []) as $coupon) {
                    if (is_array($coupon) && isset($coupon['code'])) {
                        $coupons[strtoupper((string) $coupon['code'])] = $coupon;
                    }
                }

                $cursor = $data['nextCursor'] ?? null;

                if ($cursor === null) {
                    break;
                }
            }

            return $coupons;
        });
    }

    public function isSandbox(): bool
    {
        return false;
    }

    public function provider(): string
    {
        return 'getly';
    }

    public function isConfigured(): bool
    {
        return $this->apiKey !== '';
    }

    /**
     * @param  callable(PendingRequest): Response  $send
     * @return array<string, mixed>
     */
    private function call(callable $send): array
    {
        $http = Http::baseUrl(rtrim($this->baseUrl, '/').'/')
            ->withToken($this->apiKey)
            ->acceptJson()
            ->asJson()
            ->timeout(15);

        try {
            $response = $send($http);
        } catch (ConnectionException $e) {
            throw new GatewayException('Getly could not be reached: '.$e->getMessage(), previous: $e);
        }

        $body = (array) $response->json();

        if ($response->failed() || ($body['success'] ?? false) !== true) {
            $detail = (array) ($body['errorDetail'] ?? []);
            $message = (string) ($detail['message'] ?? $body['error'] ?? 'no message');
            $code = isset($detail['code']) ? " [{$detail['code']}]" : '';

            throw new GatewayException(
                "Getly refused the request (HTTP {$response->status()}){$code}: {$message}",
                buyerMessage: ($detail['code'] ?? null) === 'coupon_invalid'
                    ? "That coupon can't be used for this plan. Clear it, or try another."
                    : null,
            );
        }

        return (array) ($body['data'] ?? []);
    }
}
