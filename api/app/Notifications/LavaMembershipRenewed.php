<?php

namespace App\Notifications;

use App\Models\LavaPayment;
use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * A monthly membership charge lava.top made on its own: a short receipt, not
 * the onboarding email ProAccessGranted sends for the first payment.
 *
 * `$renews` is false when the user turned auto-renew off and this charge
 * still went through (lava.top had already started it): the copy must not
 * say it renews again.
 */
class LavaMembershipRenewed extends BellNotification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly LavaPayment $payment,
        private readonly bool $renews = true,
    ) {}

    protected function alsoVia(object $notifiable): array
    {
        return ['mail'];
    }

    private function planName(): string
    {
        return $this->payment->user?->plan?->name ?? 'Pro';
    }

    private function until(): string
    {
        return $this->payment->granted_until?->toFormattedDateString() ?? '';
    }

    protected function toBell(object $notifiable): BellPayload
    {
        return new BellPayload(
            title: "Your {$this->planName()} renewed",
            body: $this->renews
                ? "Thanks — \${$this->payment->amount_usd} paid. It now runs until {$this->until()} and renews again on its own."
                : "Thanks — \${$this->payment->amount_usd} paid, just before you turned auto-renew off. It runs until {$this->until()}, then moves to Free.",
            icon: 'plan-upgraded',
            level: BellPayload::LEVEL_SUCCESS,
            category: BellPayload::CATEGORY_PLAN,
            actionLabel: 'See your plan',
            actionUrl: BellPayload::appUrl('/dashboard/settings'),
            meta: [
                'lava_payment' => $this->payment->uuid,
                'expires_at' => $this->payment->granted_until?->toIso8601String(),
            ],
        );
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        $plan = $this->planName();

        return (new MailMessage)
            ->subject("Your GoCast {$plan} renewed")
            ->greeting("Hey {$notifiable->name},")
            ->line("Thanks for another month. We received \${$this->payment->amount_usd}, and your GoCast {$plan} now runs until **{$this->until()}**.")
            ->line($this->renews
                ? 'It renews every month on its own. You can turn auto-renew off any time on your Account page.'
                : "This charge went through just before you turned auto-renew off, so there won't be another one. Your account moves to Free on that date.")
            ->action('See your plan', $frontendUrl.'/dashboard/settings')
            ->line('Reply to this email if anything looks wrong — it comes straight to us.');
    }
}
