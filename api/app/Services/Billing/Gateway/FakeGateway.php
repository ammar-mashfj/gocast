<?php

namespace App\Services\Billing\Gateway;

use App\Models\Payment;
use Illuminate\Support\Str;

/**
 * A gateway that never leaves this machine, for clicking through checkout on
 * a laptop with no OxaPay account or tunnel.
 *
 * "Paying" sends the buyer straight to the return URL, where the dashboard
 * waits; `php artisan billing:simulate <uuid> paid` then plays the webhook
 * OxaPay would have sent, signed with the merchant key, through the real
 * webhook route. paymentInfo() answers from the row itself, so reconcile sees
 * nothing to change.
 *
 * Refused in production by AppServiceProvider.
 */
class FakeGateway implements PaymentGateway
{
    public function createInvoice(Payment $payment, string $callbackUrl, string $returnUrl): Invoice
    {
        return new Invoice(
            trackId: 'fake-'.Str::lower(Str::random(12)),
            paymentUrl: $returnUrl,
            expiresAt: now()->addHour(),
        );
    }

    public function paymentInfo(string $trackId): array
    {
        $payment = Payment::where('track_id', $trackId)->first();

        return [
            'track_id' => $trackId,
            'order_id' => $payment?->uuid,
            'status' => $payment?->status ?? Payment::STATUS_NEW,
        ];
    }

    public function isSandbox(): bool
    {
        return true;
    }
}
