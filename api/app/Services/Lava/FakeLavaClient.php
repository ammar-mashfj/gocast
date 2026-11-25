<?php

namespace App\Services\Lava;

use App\Models\LavaPayment;
use App\Models\Product;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * lava.top for a laptop: no network, no money.
 *
 * Checkout "redirects" straight back to the account page, and
 * `php artisan lava:simulate` plays the webhooks. A charge looks paid in full
 * when the webhook re-fetches it, unless a test or the simulate command put
 * a different answer under fakeInvoice().
 *
 * Never bound in production (AppServiceProvider).
 */
class FakeLavaClient implements LavaClient
{
    public function createInvoice(
        string $email,
        string $offerId,
        string $periodicity,
        ?string $amountUsd,
        string $method,
        string $returnUrl,
    ): LavaInvoice {
        return new LavaInvoice((string) Str::uuid(), $returnUrl);
    }

    public function invoice(string $contractId): array
    {
        $stored = Cache::get(self::cacheKey($contractId));

        if (is_array($stored)) {
            return $stored;
        }

        $payment = LavaPayment::where('contract_id', $contractId)->first();

        if ($payment === null) {
            throw new LavaException("lava.top refused the request (HTTP 404): contract {$contractId} not found");
        }

        return self::completed($contractId, (string) $payment->amount_usd);
    }

    public function cancelMembership(string $contractId, string $email): void {}

    public function offerPriceUsd(string $offerId): ?string
    {
        $product = Product::where('slug', config('services.lava.membership_product'))->first();

        return $product ? number_format((float) $product->price_usd, 2, '.', '') : null;
    }

    public function products(): array
    {
        return [];
    }

    /**
     * What invoice() answers for $contractId from now on.
     *
     * @param  array<string, mixed>  $invoice
     */
    public static function fakeInvoice(string $contractId, array $invoice): void
    {
        Cache::put(self::cacheKey($contractId), $invoice, now()->addDay());
    }

    /**
     * A charge lava.top reports as paid, in GET /api/v2/invoices/{id}'s shape.
     *
     * @return array<string, mixed>
     */
    public static function completed(string $contractId, string $amountUsd, ?string $parentContractId = null): array
    {
        return [
            'id' => $contractId,
            'type' => $parentContractId ? 'SUBSCRIPTION_RENEWAL' : 'INVOICE',
            'status' => 'COMPLETED',
            'receipt' => ['amount' => (float) $amountUsd, 'currency' => 'USD', 'fee' => 0],
            'parentInvoice' => $parentContractId ? ['id' => $parentContractId] : null,
        ];
    }

    private static function cacheKey(string $contractId): string
    {
        return 'lava-fake:invoice:'.$contractId;
    }
}
