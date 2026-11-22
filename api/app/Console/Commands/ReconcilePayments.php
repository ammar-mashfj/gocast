<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Services\Billing\Gateway\GatewayException;
use App\Services\Billing\Gateway\PaymentGateway;
use App\Services\Billing\PaymentProcessor;
use Illuminate\Console\Command;

/**
 * Asks the payment provider about every payment that could still become
 * paid, and applies the answer exactly as the webhook would have.
 *
 * The safety net under the webhook: providers give up retrying after a few
 * hours, so a deploy, an outage or a Cloudflare rule blocking them would
 * otherwise leave somebody paid and on Free. Three days back covers a slow
 * chain confirmation and a weekend. Only payments made through the current
 * provider are asked about; the others' links can't be looked up with it.
 */
class ReconcilePayments extends Command
{
    protected $signature = 'billing:reconcile {--days=3 : How far back to look}';

    protected $description = 'Ask the payment provider about open payments and apply anything the webhook missed';

    public function handle(PaymentGateway $gateway, PaymentProcessor $processor): int
    {
        if (! $gateway->isConfigured()) {
            $this->info("The {$gateway->provider()} gateway has no credentials, so there is nothing to reconcile.");

            return self::SUCCESS;
        }

        $checked = 0;
        $failed = 0;

        Payment::open()
            ->where('provider', $gateway->provider())
            ->whereNotNull('track_id')
            ->where('created_at', '>=', now()->subDays((int) $this->option('days')))
            ->orderBy('id')
            ->each(function (Payment $payment) use ($gateway, $processor, &$checked, &$failed) {
                try {
                    $processor->process($gateway->paymentInfo($payment->track_id), 'reconcile');
                    $checked++;
                } catch (GatewayException $e) {
                    // One unreachable call must not stop the rest; the next
                    // run tries again.
                    report($e);
                    $failed++;
                }
            });

        $this->info("Checked {$checked} open payment(s)".($failed ? ", {$failed} could not be checked" : '').'.');

        return self::SUCCESS;
    }
}
