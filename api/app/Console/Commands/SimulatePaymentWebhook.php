<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Services\Billing\OxaPaySignature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Plays the webhook OxaPay would send for one payment, signed with the
 * merchant key, through the real /api/webhooks/oxapay route over HTTP.
 *
 * For testing the whole loop on a laptop — signature check, grant, emails,
 * the account page flipping to Pro — without OxaPay or a tunnel. Pairs with
 * OXAPAY_DRIVER=fake, but works against sandbox invoices too. Refused in
 * production: a correctly signed "paid" is a free plan.
 */
class SimulatePaymentWebhook extends Command
{
    protected $signature = 'billing:simulate
        {payment : Payment uuid or OxaPay track id}
        {status=paid : paying | paid | manual_accept | underpaid | expired | refunding | refunded}
        {--url= : Webhook URL (defaults to this app\'s own route)}';

    protected $description = 'Send a signed OxaPay webhook for a payment (local testing only)';

    public function handle(): int
    {
        if (app()->isProduction()) {
            $this->error('Refused in production: a signed webhook grants a plan without payment.');

            return self::FAILURE;
        }

        $key = (string) config('services.oxapay.merchant_key');

        if ($key === '') {
            $this->error('Set OXAPAY_MERCHANT_KEY (any value works with OXAPAY_DRIVER=fake) so the webhook can be signed.');

            return self::FAILURE;
        }

        $id = (string) $this->argument('payment');
        $payment = Payment::where('uuid', $id)->orWhere('track_id', $id)->first();

        if ($payment === null || $payment->track_id === null) {
            $this->error("No payment with an invoice matches {$id}.");

            return self::FAILURE;
        }

        // Shaped like OxaPay's documented "Paid" IPN, capitalised status
        // included, so the processor is exercised on what really arrives.
        $body = json_encode([
            'track_id' => $payment->track_id,
            'status' => ucwords(str_replace('_', ' ', (string) $this->argument('status'))),
            'type' => 'invoice',
            'module_name' => 'OxaPay',
            'amount' => (float) $payment->amount_usd,
            'value' => (float) $payment->amount_usd,
            'currency' => 'USDT',
            'order_id' => $payment->uuid,
            'email' => $payment->user?->email,
            'description' => $payment->product_name,
            'date' => now()->getTimestamp(),
            'txs' => [],
        ], JSON_UNESCAPED_SLASHES);

        $url = (string) ($this->option('url') ?: route('webhooks.oxapay'));

        $response = Http::withHeaders(['HMAC' => OxaPaySignature::sign($body, $key)])
            ->withBody($body, 'application/json')
            ->post($url);

        $this->line("POST {$url} → {$response->status()} {$response->body()}");

        $payment->refresh();
        $this->info("Payment is now {$payment->status}".($payment->granted_until ? ", granted until {$payment->granted_until}" : '').($payment->review_reason ? ". Review: {$payment->review_reason}" : '.'));

        return $response->successful() ? self::SUCCESS : self::FAILURE;
    }
}
