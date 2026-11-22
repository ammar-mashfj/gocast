<?php

namespace App\Services\Billing\Gateway;

use App\Models\Payment;

/**
 * What Gateways::current() hands out when BILLING_GATEWAY names no gateway:
 * never configured, so checkout refuses and the admin Payments page warns,
 * while everything that only reads prices keeps working.
 */
final class UnknownGateway implements PaymentGateway
{
    public function __construct(private readonly string $name) {}

    public function createInvoice(Payment $payment, string $callbackUrl, string $returnUrl): Invoice
    {
        throw new GatewayException("BILLING_GATEWAY is \"{$this->name}\", which is not a payment gateway.");
    }

    public function paymentInfo(string $trackId): array
    {
        throw new GatewayException("BILLING_GATEWAY is \"{$this->name}\", which is not a payment gateway.");
    }

    public function isSandbox(): bool
    {
        return false;
    }

    public function provider(): string
    {
        return $this->name;
    }

    public function isConfigured(): bool
    {
        return false;
    }
}
