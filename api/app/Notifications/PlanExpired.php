<?php

namespace App\Notifications;

use App\Models\Plan;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells someone their time-limited plan has ended and they are back on Free.
 *
 * Sent by plans:expire, the only thing that moves an account down
 * automatically. Worth sending because the change is otherwise invisible
 * until something refuses: the library upload 403s, the listener cap bites.
 * Nothing they built is touched — see ExpirePlans for why — so the copy says
 * so rather than leaving them to wonder.
 */
class PlanExpired extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly Plan $endedPlan,
        private readonly Plan $newPlan,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');

        return (new MailMessage)
            ->subject("Your GoCast {$this->endedPlan->name} period has ended")
            ->greeting("Hey {$notifiable->name},")
            ->line("Your time on GoCast {$this->endedPlan->name} is up, and your account is now on {$this->newPlan->name}.")
            ->line('Your station, its link and everything you uploaded are exactly where you left them. What changes is the plan limits: up to '.number_format($this->newPlan->max_listeners).' listeners at once'.($this->endedPlan->autodj_enabled && ! $this->newPlan->autodj_enabled ? ', and the AutoDJ library no longer accepts uploads.' : '.'))
            ->action('Open your dashboard', "{$frontendUrl}/dashboard")
            ->line("Want to stay on {$this->endedPlan->name}? Reply to this email and tell us — it comes straight to us.")
            ->salutation('— The GoCast team');
    }
}
