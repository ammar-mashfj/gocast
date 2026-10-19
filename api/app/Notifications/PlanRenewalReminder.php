<?php

namespace App\Notifications;

use App\Models\Payment;
use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * "Your Pro ends on the 24th" — sent by billing:remind-renewals seven days and
 * one day before a PAID term runs out.
 *
 * Digital-currency payments don't renew automatically, so without this a paying customer finds
 * out from plans:expire, after the station has already lost AutoDJ. Only for
 * terms that came from a payment: a gifted grant ending is not something we
 * chase people to pay for.
 *
 * A heads-up only: there is no way to buy more time before a term ends (it
 * was dropped until it can be done properly), so it offers no checkout. Once
 * the account is back on Free, Get Pro works as for anyone else.
 */
class PlanRenewalReminder extends BellNotification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly Payment $payment,
        private readonly bool $lastDay,
    ) {}

    /**
     * @return list<string>
     */
    protected function alsoVia(object $notifiable): array
    {
        return ['mail'];
    }

    private function planName(): string
    {
        return $this->payment->plan?->name ?? 'plan';
    }

    private function endsOn(): string
    {
        return $this->payment->granted_until?->toFormattedDateString() ?? '';
    }

    protected function toBell(object $notifiable): BellPayload
    {
        return new BellPayload(
            title: $this->lastDay ? "Your {$this->planName()} ends tomorrow" : "Your {$this->planName()} ends on {$this->endsOn()}",
            body: 'After that your account goes back to Free, and AutoDJ stops when you’re not live. You can get Pro again from your dashboard once it has ended.',
            icon: 'bell',
            level: $this->lastDay ? BellPayload::LEVEL_WARNING : BellPayload::LEVEL_INFO,
            category: BellPayload::CATEGORY_PLAN,
            actionLabel: 'See your plan',
            actionUrl: BellPayload::appUrl('/dashboard/settings'),
            meta: [
                'payment' => $this->payment->uuid,
                'ends_at' => $this->payment->granted_until?->toIso8601String(),
            ],
        );
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        $plan = $this->planName();

        return (new MailMessage)
            ->subject($this->lastDay ? "Your GoCast {$plan} ends tomorrow" : "Your GoCast {$plan} ends on {$this->endsOn()}")
            ->greeting("Hey {$notifiable->name},")
            ->line("Your GoCast {$plan} runs until **{$this->endsOn()}**. After that your account goes back to Free on its own, and AutoDJ stops when you're not live.")
            ->line('Once it has ended you can get Pro again from your dashboard, paying with USDT, USDC or another digital currency.')
            ->action('See your plan', $frontendUrl.'/dashboard/settings')
            ->line('Reply to this email if anything looks wrong — it comes straight to us.')
            ->salutation('— The GoCast team');
    }
}
