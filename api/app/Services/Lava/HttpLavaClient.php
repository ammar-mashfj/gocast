<?php

namespace App\Services\Lava;

use App\Models\LavaPayment;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * gate.lava.top, called directly (spec: gate.lava.top/docs/documentation.yaml).
 *
 * Authenticated with the `X-Api-Key` header. Payments are in USD. Each
 * payment is tied to one processor, picked by the buyer in our dialog: cards
 * through Unlimint, or PayPal.
 */
class HttpLavaClient implements LavaClient
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
    ) {}

    public function createInvoice(
        string $email,
        string $offerId,
        string $periodicity,
        ?string $amountUsd,
        string $method,
        string $returnUrl,
    ): LavaInvoice {
        $body = [
            'email' => $email,
            'offerId' => $offerId,
            'currency' => 'USD',
            'periodicity' => $periodicity,
            'buyerLanguage' => 'EN',
        ] + ($method === LavaPayment::METHOD_PAYPAL
            ? ['paymentProvider' => 'PAYPAL']
            : ['paymentProvider' => 'UNLIMINT', 'paymentMethod' => 'CARD']);

        // lava.top refuses anything but https here, which a laptop's
        // http://localhost is not. Without them the buyer stays on lava.top's
        // own result page, and the dashboard tab still updates by polling.
        if (str_starts_with($returnUrl, 'https://')) {
            $body['successful_return_url'] = $returnUrl;
            $body['failure_return_url'] = $returnUrl;
            $body['cancel_return_url'] = $returnUrl;
        }

        if ($amountUsd !== null) {
            $body['amount'] = (float) $amountUsd;
        }

        $data = $this->call(fn (PendingRequest $http) => $http->post('api/v3/invoice', $body));

        $id = (string) ($data['id'] ?? '');
        $url = (string) ($data['paymentUrl'] ?? '');

        if ($id === '' || $url === '') {
            throw new LavaException('lava.top created a payment without an id or paymentUrl.');
        }

        return new LavaInvoice($id, $url);
    }

    public function invoice(string $contractId): array
    {
        return $this->call(fn (PendingRequest $http) => $http->get('api/v2/invoices/'.rawurlencode($contractId)));
    }

    public function cancelMembership(string $contractId, string $email): void
    {
        $this->call(fn (PendingRequest $http) => $http->delete('api/v1/subscriptions?'.http_build_query([
            'contractId' => $contractId,
            'email' => $email,
        ])));
    }

    /**
     * Cached for ten minutes: checkout asks on every membership purchase,
     * and the price changes only when Ammar edits it in lava.top.
     */
    public function offerPriceUsd(string $offerId): ?string
    {
        $price = Cache::remember('lava:offer-price:'.$offerId, now()->addMinutes(10), function () use ($offerId) {
            foreach ($this->products() as $product) {
                foreach ((array) ($product['offers'] ?? []) as $offer) {
                    if (($offer['id'] ?? null) !== $offerId) {
                        continue;
                    }

                    // An offer can carry one price per billing period (monthly
                    // and yearly); the membership is sold monthly.
                    foreach ((array) ($offer['prices'] ?? []) as $price) {
                        if (($price['currency'] ?? null) === 'USD' && isset($price['amount']) && in_array($price['periodicity'] ?? 'MONTHLY', ['MONTHLY', null], true)) {
                            return number_format((float) $price['amount'], 2, '.', '');
                        }
                    }
                }
            }

            // Cache "not found" as an empty string: null would not be cached.
            return '';
        });

        return $price === '' ? null : $price;
    }

    public function products(): array
    {
        $products = [];
        $query = ['feedVisibility' => 'ALL', 'showAllSubscriptionPeriods' => 'true'];

        // Paged by `beforeCreatedAt`; capped so a malformed nextPage can't loop.
        for ($page = 0; $page < 20; $page++) {
            $data = $this->call(fn (PendingRequest $http) => $http->get('api/v2/products', $query));

            // The spec wraps each product as {type, data}, but the live API
            // returns the product itself (id, title, type, offers). Take both.
            foreach ((array) ($data['items'] ?? []) as $item) {
                if (is_array($item['data'] ?? null)) {
                    if (($item['type'] ?? 'PRODUCT') === 'PRODUCT') {
                        $products[] = $item['data'];
                    }
                } elseif (is_array($item) && isset($item['offers'])) {
                    $products[] = $item;
                }
            }

            $next = $data['nextPage'] ?? null;

            if (! is_string($next) || $next === '') {
                break;
            }

            parse_str((string) parse_url($next, PHP_URL_QUERY), $nextQuery);

            if (! isset($nextQuery['beforeCreatedAt'])) {
                break;
            }

            $query['beforeCreatedAt'] = $nextQuery['beforeCreatedAt'];
        }

        return $products;
    }

    /**
     * @param  callable(PendingRequest): Response  $send
     * @return array<string, mixed>
     */
    private function call(callable $send): array
    {
        $http = Http::baseUrl(rtrim($this->baseUrl, '/').'/')
            ->withHeaders(['X-Api-Key' => $this->apiKey])
            ->acceptJson()
            ->asJson()
            ->timeout(15);

        try {
            $response = $send($http);
        } catch (ConnectionException $e) {
            throw new LavaException('lava.top could not be reached: '.$e->getMessage(), previous: $e);
        }

        if ($response->failed()) {
            $message = (string) ($response->json('error') ?? 'no message');

            throw new LavaException("lava.top refused the request (HTTP {$response->status()}): {$message}");
        }

        return (array) $response->json();
    }
}
