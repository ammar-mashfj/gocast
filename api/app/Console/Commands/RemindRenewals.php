<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Models\User;
use App\Notifications\PlanRenewalReminder;
use Illuminate\Console\Command;

/**
 * Emails paying customers seven days and one day before their term ends.
 *
 * Only a term that came from a payment counts: the account's current end
 * date must be the `granted_until` of one of its granted payments, on the
 * same plan. Anything else — an invite, an admin gift, an admin extension of
 * a paid term — ends without a reminder, by decision.
 *
 * Each reminder is stamped on the payment, and a renewal is a new payment
 * with a new end date, so every term gets its own two reminders and never a
 * repeat.
 */
class RemindRenewals extends Command
{
    protected $signature = 'billing:remind-renewals';

    protected $description = 'Remind paying customers before their plan term ends';

    public function handle(): int
    {
        $sent = 0;

        $users = User::query()
            ->whereNotNull('plan_expires_at')
            ->where('plan_expires_at', '>', now())
            ->where('plan_expires_at', '<=', now()->addDays(7))
            ->get();

        foreach ($users as $user) {
            $payment = Payment::where('user_id', $user->id)
                ->whereNotNull('granted_at')
                ->where('plan_id', $user->plan_id)
                ->where('granted_until', $user->plan_expires_at)
                ->whereNotIn('status', [Payment::STATUS_REFUNDING, Payment::STATUS_REFUNDED])
                ->latest('id')
                ->first();

            if ($payment === null) {
                continue;
            }

            $lastDay = $user->plan_expires_at->lte(now()->addDay());

            // A term bought in the last couple of days (a one-week product, an
            // early renewal landing inside the window) has not been forgotten.
            if (! $lastDay && $payment->granted_at->gt(now()->subDays(2))) {
                continue;
            }

            if ($lastDay ? $payment->reminded_1d_at !== null : ($payment->reminded_7d_at !== null || $payment->reminded_1d_at !== null)) {
                continue;
            }

            $payment->forceFill([$lastDay ? 'reminded_1d_at' : 'reminded_7d_at' => now()])->save();
            $user->notify(new PlanRenewalReminder($payment, $lastDay));
            $sent++;
        }

        $this->info("Sent {$sent} renewal reminder(s).");

        return self::SUCCESS;
    }
}
