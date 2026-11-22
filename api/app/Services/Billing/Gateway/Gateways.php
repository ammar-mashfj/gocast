<?php

namespace App\Services\Billing\Gateway;

use InvalidArgumentException;
use RuntimeException;

/**
 * Builds a gateway by provider name, from config.
 *
 * Checkout and reconcile use the current one (`services.billing.gateway`,
 * bound as PaymentGateway); admin Recheck uses the one a payment was made
 * with, so an old OxaPay payment is still asked about on OxaPay after the
 * switch to Getly.
 *
 * The fake gateway grants plans without money moving, so it must never
 * answer a real buyer: it is refused in production rather than trusting
 * .env to be right.
 */
final class Gateways
{
    public static function make(string $provider): PaymentGateway
    {
        $oxapay = (array) config('services.oxapay');

        if ($provider === 'fake' || ($provider === 'oxapay' && ($oxapay['driver'] ?? 'oxapay') === 'fake')) {
            if (app()->isProduction()) {
                throw new RuntimeException('The fake payment gateway is not allowed in production.');
            }

            return new FakeGateway;
        }

        if ($provider === 'getly') {
            $getly = (array) config('services.getly');

            return new GetlyGateway(
                apiKey: (string) ($getly['api_key'] ?? ''),
                baseUrl: (string) ($getly['base_url'] ?? 'https://www.getly.store/api/v1'),
                products: (array) ($getly['products'] ?? []),
                lifetimeHours: (int) ($getly['link_lifetime_hours'] ?? 24),
            );
        }

        if ($provider !== 'oxapay') {
            throw new InvalidArgumentException("There is no payment gateway called \"{$provider}\".");
        }

        return new OxaPayGateway(
            merchantKey: (string) ($oxapay['merchant_key'] ?? ''),
            baseUrl: (string) ($oxapay['base_url'] ?? 'https://api.oxapay.com/v1'),
            sandbox: (bool) ($oxapay['sandbox'] ?? false),
            lifetimeMinutes: (int) ($oxapay['invoice_lifetime_minutes'] ?? 60),
        );
    }

    public static function current(): PaymentGateway
    {
        return self::make((string) config('services.billing.gateway', 'getly'));
    }
}
