<?php

namespace App\Services\Lava;

/**
 * lava.top's public API, as checkout and the webhook need it.
 *
 * Bound in AppServiceProvider from `services.lava.driver`: HttpLavaClient for
 * gate.lava.top, FakeLavaClient for a laptop with no lava.top account.
 */
interface LavaClient
{
    /**
     * Create a payment (lava.top calls it an invoice, or contract) and return
     * where to send the buyer.
     *
     * `$amountUsd` is sent only for the pack product, which has no price of its
     * own in lava.top; the membership's price is lava.top's, so it is null there.
     * `$method` is card or paypal (LavaPayment::METHODS).
     *
     * @throws LavaException
     */
    public function createInvoice(
        string $email,
        string $offerId,
        string $periodicity,
        ?string $amountUsd,
        string $method,
        string $returnUrl,
    ): LavaInvoice;

    /**
     * One charge as lava.top sees it now (GET /api/v2/invoices/{id}):
     * `status` (NEW, IN_PROGRESS, COMPLETED, FAILED), `type`,
     * `receipt.amount`, `receipt.currency`, `parentInvoice.id`, …
     *
     * @return array<string, mixed>
     *
     * @throws LavaException
     */
    public function invoice(string $contractId): array;

    /**
     * Stop a membership's future charges. `$contractId` is its first charge.
     *
     * @throws LavaException
     */
    public function cancelMembership(string $contractId, string $email): void;

    /**
     * The USD price lava.top charges for `$offerId`, or null when the offer
     * is not found or has no USD price.
     *
     * @throws LavaException
     */
    public function offerPriceUsd(string $offerId): ?string;

    /**
     * Every product on the account with its offers, hidden ones included —
     * for `lava:products`, which prints the ids to put in .env.
     *
     * @return list<array<string, mixed>>
     *
     * @throws LavaException
     */
    public function products(): array;
}
