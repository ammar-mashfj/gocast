<?php

namespace App\Services\Billing\Gateway;

use App\Models\Payment;

/**
 * The payment provider, as checkout and reconcile need it.
 *
 * Bound in AppServiceProvider from `services.billing.gateway`: GetlyGateway
 * (card or USDT/USDC), OxaPayGateway (digital currency, live or sandbox), or
 * FakeGateway for a laptop with no provider at all.
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

    /** What goes in `payments.provider`: getly, oxapay or fake. */
    public function provider(): string;

    /** Whether it has the credentials to create invoices at all. */
    public function isConfigured(): bool;
}
