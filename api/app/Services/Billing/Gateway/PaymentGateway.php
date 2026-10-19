<?php

namespace App\Services\Billing\Gateway;

use App\Models\Payment;

/**
 * The digital-currency payment provider (OxaPay), as checkout and reconcile need it.
 *
 * Bound in AppServiceProvider from `services.oxapay.driver`: OxaPayGateway
 * for the real API (live or sandbox), FakeGateway for a laptop with no
 * OxaPay at all.
 */
interface PaymentGateway
{
    /**
     * Create the hosted invoice for $payment and return where to send the
     * buyer.
     *
     * @throws GatewayException
     */
    public function createInvoice(Payment $payment, string $callbackUrl, string $returnUrl): Invoice;

    /**
     * The invoice as the provider sees it now, in the same shape as a webhook
     * body (`status`, `track_id`, `order_id`, …).
     *
     * @return array<string, mixed>
     *
     * @throws GatewayException
     */
    public function paymentInfo(string $trackId): array;

    /** Whether invoices this gateway creates are test money. */
    public function isSandbox(): bool;
}
