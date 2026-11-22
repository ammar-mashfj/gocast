<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Services\Billing\Gateway\GatewayException;
use App\Services\Billing\Gateway\Gateways;
use App\Services\Billing\PaymentProcessor;
use Illuminate\Console\Command;
use InvalidArgumentException;
use RuntimeException;

/**
 * Asks the payment provider about every payment that could still become
 * paid, and applies the answer exactly as the webhook would have.
 *
 * The safety net under the webhook: providers give up retrying after a few
 * hours, so a deploy, an outage or a Cloudflare rule blocking them would
 * otherwise leave somebody paid and on Free. Three days back covers a slow
 * chain confirmation and a weekend. Each payment is asked about on the
 * provider it was made with, so OxaPay invoices still open when checkout
 * moved to Getly are granted too (while OXAPAY_MERCHANT_KEY is set).
 */
class ReconcilePayments extends Command
{
    protected $signature = 'billing:reconcile {--days=3 : How far back to look}';

    protected $description = 'Ask the payment provider about open payments and apply anything the webhook missed';

    public function handle(PaymentProcessor $processor): int
    {
        $checked = 0;
        $failed = 0;

        // `order:` ids are Getly store-page sales: they came in by webhook and
        // have no link to ask about.
        $open = Payment::open()
            ->whereNotNull('track_id')
            ->where('track_id', 'not like', 'order:%')
            ->where('created_at', '>=', now()->subDays((int) $this->option('days')))
            ->orderBy('id')
            ->get()
            ->groupBy('provider');

        foreach ($open as $provider => $payments) {
            try {
                $gateway = Gateways::make((string) $provider);
            } catch (RuntimeException) {
                // The fake gateway in production: nothing real to ask.
                continue;
            } catch (InvalidArgumentException $e) {
                $this->warn($e->getMessage().' '.count($payments).' open payment(s) were skipped.');

                continue;
            }

            if (! $gateway->isConfigured()) {
                $this->info("The {$provider} gateway has no credentials, so its ".count($payments).' open payment(s) were skipped.');

                continue;
            }

            foreach ($payments as $payment) {
                try {
                    $processor->process($gateway->paymentInfo($payment->track_id), 'reconcile');
                    $checked++;
                } catch (GatewayException $e) {
                    // One unreachable call must not stop the rest; the next
                    // run tries again.
                    report($e);
                    $failed++;
                }
            }
        }

        $this->info("Checked {$checked} open payment(s)".($failed ? ", {$failed} could not be checked" : '').'.');

        return self::SUCCESS;
    }
}
