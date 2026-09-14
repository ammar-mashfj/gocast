<?php

namespace App\Notifications;

use App\Models\Plan;
use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Tells someone their time-limited plan has ended and they are back on Free.
 *
 * Sent by plans:expire, the only thing that moves an account down
 * automatically. Worth sending because the change is otherwise invisible
 * until something refuses: the library upload 403s, the listener cap bites.
 * Nothing they built is touched — see ExpirePlans for why — so the copy says
 * so rather than leaving them to wonder.
 */
class PlanExpired extends BellNotification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly Plan $endedPlan,
        private readonly Plan $newPlan,
    ) {}

    /**
     * @return list<string>
     */
    protected function alsoVia(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * The downgrade is invisible in the product until something refuses — the
     * reason this notification exists at all — and an email can be missed or
     * filed. The bell puts the same sentence inside the dashboard the limits
     * now apply to.
     *
     * `warning`, not `error`: nothing is broken and nothing was taken away.
     * The account works, with smaller numbers.
     */
    protected function toBell(object $notifiable): BellPayload
    {
        // "Nothing was taken away" moves OUT of the body and into the points.
        // The row can only be trusted to deliver its first line, and the first
        // line of a downgrade has to be the downgrade; the reassurance is what
        // somebody opens it to read.
        $points = ['Your station, its link and everything you uploaded are untouched.'];

        // THE FACT THIS NOTIFICATION EXISTS FOR, and until now it lived only in
        // the email. The downgrade is invisible in the product until something
        // refuses, and this is the thing that refuses first — someone who is
        // going to hit it is going to hit it mid-upload, with no idea why.
        if ($this->endedPlan->autodj_enabled && ! $this->newPlan->autodj_enabled) {
            $points[] = 'The AutoDJ library no longer accepts new uploads.';
        }

        // The retention path the email offers and the product does not. There
        // is no self-serve way back onto a plan, so the reply is not a fobbing
        // off — it is the only route there is.
        $points[] = "Want to stay on {$this->endedPlan->name}? Reply to the email we sent — it comes straight to us.";

        return new BellPayload(
            title: "Your {$this->endedPlan->name} period has ended",
            body: "You're now on {$this->newPlan->name}, with up to "
                .number_format($this->newPlan->max_listeners)
                .' listeners at once.',
            icon: 'plan-expired',
            level: BellPayload::LEVEL_WARNING,
            category: BellPayload::CATEGORY_PLAN,
            actionLabel: 'Open your dashboard',
            actionUrl: BellPayload::appUrl('/dashboard'),
            actionMode: BellPayload::MODE_EXPAND,
            detailHeading: 'What this means',
            detailPoints: $points,
            meta: [
                'ended_plan' => $this->endedPlan->slug,
                'new_plan' => $this->newPlan->slug,
            ],
        );
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
