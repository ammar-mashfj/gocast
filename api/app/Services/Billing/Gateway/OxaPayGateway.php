<?php

namespace App\Services\Billing\Gateway;

use App\Models\Payment;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * OxaPay's merchant API (v1), called directly.
 *
 * Not through the oxapay/oxapay-laravel SDK: its only release requires
 * illuminate ≤12 and this app is on Laravel 13, and the two calls below are
 * all checkout needs.
 *
 * Invoices are priced in USD and OxaPay lets the buyer pay in any coin it
 * supports, converting what arrives to USDT (`to_currency`). The fee is ours
 * (`fee_paid_by_payer: 0`), so the price the buyer sees is the price they pay.
 */
class OxaPayGateway implements PaymentGateway
{
    public function __construct(
        private readonly string $merchantKey,
        private readonly string $baseUrl,
        private readonly bool $sandbox,
        private readonly int $lifetimeMinutes,
    ) {}

    public function createInvoice(Payment $payment, string $callbackUrl, string $returnUrl): Invoice
    {
        $data = $this->call(fn (PendingRequest $http) => $http->post('payment/invoice', [
            'amount' => (float) $payment->amount_usd,
            'currency' => 'USD',
            'lifetime' => max(15, min(2880, $this->lifetimeMinutes)),
            'fee_paid_by_payer' => 0,
            'to_currency' => 'USDT',
            'callback_url' => $callbackUrl,
            'return_url' => $returnUrl,
            'email' => $payment->user?->email,
            'order_id' => $payment->uuid,
            'description' => $payment->product_name,
            'thanks_message' => 'Thanks! Your GoCast plan switches on as soon as the payment confirms.',
            'sandbox' => $this->sandbox,
        ]));

        $trackId = (string) ($data['track_id'] ?? '');
        $url = (string) ($data['payment_url'] ?? '');

        if ($trackId === '' || $url === '') {
            throw new GatewayException('OxaPay created an invoice without a track_id or payment_url.');
        }

        return new Invoice(
            trackId: $trackId,
            paymentUrl: $url,
            expiresAt: isset($data['expired_at']) ? Carbon::createFromTimestamp((int) $data['expired_at']) : null,
        );
    }

    public function paymentInfo(string $trackId): array
    {
        return $this->call(fn (PendingRequest $http) => $http->get('payment/'.rawurlencode($trackId)));
    }

    public function isSandbox(): bool
    {
        return $this->sandbox;
    }

    /**
     * @param  callable(PendingRequest): Response  $send
     * @return array<string, mixed>
     */
    private function call(callable $send): array
    {
        $http = Http::baseUrl(rtrim($this->baseUrl, '/').'/')
            ->withHeaders(['merchant_api_key' => $this->merchantKey])
            ->acceptJson()
            ->asJson()
            ->timeout(15);

        try {
            $response = $send($http);
        } catch (ConnectionException $e) {
            throw new GatewayException('OxaPay could not be reached: '.$e->getMessage(), previous: $e);
        }

        $body = (array) $response->json();

        // OxaPay puts its own status in the body as well as on the response;
        // either one failing is a refusal.
        if ($response->failed() || (int) ($body['status'] ?? 200) !== 200) {
            $error = (array) ($body['error'] ?? []);
            $message = (string) ($error['message'] ?? $body['message'] ?? 'no message');

            throw new GatewayException("OxaPay refused the request (HTTP {$response->status()}): {$message}");
        }

        return (array) ($body['data'] ?? []);
    }
}
