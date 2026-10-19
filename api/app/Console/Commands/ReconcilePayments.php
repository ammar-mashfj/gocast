<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Services\Billing\Gateway\GatewayException;
use App\Services\Billing\Gateway\PaymentGateway;
use App\Services\Billing\PaymentProcessor;
use Illuminate\Console\Command;

/**
 * Asks OxaPay about every payment that could still become paid, and applies
 * the answer exactly as the webhook would have.
 *
 * The safety net under the webhook: OxaPay gives up after five deliveries
 * over about three and a half hours, so a deploy, an outage or a Cloudflare
 * rule blocking them would otherwise leave somebody paid and on Free. Three
 * days back covers a slow chain confirmation and a weekend.
 */
class ReconcilePayments extends Command
{
    protected $signature = 'billing:reconcile {--days=3 : How far back to look}';

    protected $description = 'Ask OxaPay about open payments and apply anything the webhook missed';

    public function handle(PaymentGateway $gateway, PaymentProcessor $processor): int
    {
        if (blank(config('services.oxapay.merchant_key'))) {
            $this->info('OXAPAY_MERCHANT_KEY is blank, so there is nothing to reconcile.');

            return self::SUCCESS;
        }

        $checked = 0;
        $failed = 0;

        Payment::open()
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
