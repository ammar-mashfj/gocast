<?php

namespace App\Console\Commands;

use App\Models\LavaMembership;
use App\Models\LavaPayment;
use App\Services\Lava\FakeLavaClient;
use App\Services\Lava\LavaWebhook;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Plays a lava.top webhook against a local checkout, for LAVA_DRIVER=fake.
 *
 *   lava:simulate {payment uuid}             payment.success (default)
 *   lava:simulate {payment uuid} failed      payment.failed
 *   lava:simulate {payment uuid} renewal     a month later, lava.top charges again
 *   lava:simulate {payment uuid} cancelled   the membership is cancelled
 *   lava:simulate {payment uuid} refund      the charge is refunded
 */
class LavaSimulate extends Command
{
    protected $signature = 'lava:simulate {payment : The lava payment uuid from the dashboard URL (?lava=…)} {event=paid : paid, failed, renewal, cancelled or refund}';

    protected $description = 'Play a lava.top webhook locally (LAVA_DRIVER=fake only)';

    public function handle(LavaWebhook $webhook): int
    {
        if (config('services.lava.driver') !== 'fake') {
            $this->error('Only with LAVA_DRIVER=fake: against real lava.top this would grant Pro without a payment.');

            return self::FAILURE;
        }

        $payment = LavaPayment::where('uuid', $this->argument('payment'))->first();

        if ($payment === null || $payment->contract_id === null) {
            $this->error('No lava payment with that uuid (or it never reached lava.top).');

            return self::FAILURE;
        }

        $base = [
            'product' => ['id' => (string) Str::uuid(), 'title' => $payment->product_name],
            'buyer' => ['email' => $payment->email],
            'amount' => (float) $payment->amount_usd,
            'currency' => 'USD',
            'timestamp' => now()->toIso8601String(),
        ];

        $membership = $payment->membership ?? LavaMembership::where('contract_id', $payment->contract_id)->first();

        $body = match ((string) $this->argument('event')) {
            'paid' => $base + [
                'eventType' => 'payment.success',
                'contractId' => $payment->contract_id,
                'status' => $payment->kind === LavaPayment::KIND_PACK ? 'completed' : 'subscription-active',
            ],
            'failed' => $base + [
                'eventType' => 'payment.failed',
                'contractId' => $payment->contract_id,
                'status' => 'failed',
                'errorMessage' => 'Simulated decline',
            ],
            'renewal' => $this->renewal($base, $membership),
            'cancelled' => $base + [
                'eventType' => 'subscription.cancelled',
                'contractId' => $membership?->contract_id ?? $payment->contract_id,
                'cancelledAt' => now()->toIso8601String(),
                'willExpireAt' => $payment->user?->plan_expires_at?->toIso8601String(),
            ],
            'refund' => [
                'event_id' => (string) Str::uuid(),
                'event_type' => 'refund.success',
                'created_at' => now()->toIso8601String(),
                'data' => [
                    'refund_id' => (string) Str::uuid(),
                    'parent_invoice_id' => $payment->contract_id,
                    'refund_type' => 'full',
                    'initiator' => 'creator',
                    'amount' => (float) $payment->amount_usd,
                    'currency' => 'USD',
                    'customer_email' => $payment->email,
                    'subscription_cancelled' => false,
                ],
            ],
            default => null,
        };

        if ($body === null) {
            if ($this->argument('event') !== 'renewal') {
                $this->error('Unknown event. Use paid, failed, renewal, cancelled or refund.');
            }

            return self::FAILURE;
        }

        $webhook->handle($body);

        $this->info('Played '.($body['eventType'] ?? $body['event_type']).' for '.$payment->uuid.'.');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $base
     * @return array<string, mixed>|null
     */
    private function renewal(array $base, ?LavaMembership $membership): ?array
    {
        if ($membership === null) {
            $this->error('That payment has no membership yet. Simulate "paid" on a monthly checkout first.');

            return null;
        }

        $contractId = (string) Str::uuid();
        FakeLavaClient::fakeInvoice($contractId, FakeLavaClient::completed($contractId, (string) $base['amount'], $membership->contract_id));

        return $base + [
            'eventType' => 'subscription.recurring.payment.success',
            'contractId' => $contractId,
            'parentContractId' => $membership->contract_id,
            'status' => 'subscription-active',
        ];
    }
}
