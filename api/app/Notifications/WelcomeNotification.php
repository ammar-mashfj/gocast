<?php

namespace App\Notifications;

use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Sent immediately after a new user verifies their email.
 *
 * Anchored on the verification event (not registration) so the user is
 * actually reachable — and so we don't double-send for OAuth signups
 * where the email is auto-verified.
 *
 * InviteRedeemed REPLACES this for accounts that arrived through an invite
 * link rather than adding to it, so the two never land together — see its
 * docblock. That is also why this one names no plan: an ordinary signup is on
 * Free and has nothing to announce beyond the account being ready.
 *
 * ShouldQueue is not optional now that this reaches the bell as well as the
 * inbox. Laravel makes one job per channel, so a slow mail host can no longer
 * take the exception out through notify() and into the Verified listener that
 * dispatched it — which would leave a freshly verified account with neither
 * the row nor the email. BellContractTest enforces the rule for every bell
 * notification that also sends mail.
 */
class WelcomeNotification extends BellNotification implements ShouldQueue
{
    use Queueable;

    /**
     * @return list<string>
     */
    protected function alsoVia(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * The welcome email is the one message every single account gets, and it
     * is sent at the one moment nobody is reading email — they have just typed
     * a code into the dashboard and are looking at it. So the bell carries the
     * same three steps, where they already are.
     *
     * Expanding rather than linking because those steps are the content. A row
     * that said "create your first station" and went straight there would be a
     * worse version of the button the dashboard already shows an empty account.
     *
     * CATEGORY_STATION, not ACCOUNT: the category names what the notification
     * is ABOUT, and every word of this is about getting a station on air.
     * `account` is reserved for identity and security — see BellPayload.
     */
    protected function toBell(object $notifiable): BellPayload
    {
        return new BellPayload(
            title: 'Your GoCast account is ready',
            body: "You're one click away from broadcasting live to anyone with a browser.",
            icon: 'radio',
            level: BellPayload::LEVEL_SUCCESS,
            category: BellPayload::CATEGORY_STATION,
            actionLabel: 'Create your first station',
            actionUrl: BellPayload::appUrl('/dashboard/stations'),
            actionMode: BellPayload::MODE_EXPAND,
            detailHeading: 'Getting started',
            detailPoints: [
                'Create your station — it needs a name and nothing else.',
                'Hit go live. Your browser is the whole studio: no installs, no plugins.',
                'Share your station link. Anyone can listen in a browser, no account needed.',
                'Stuck on anything? Reply to the welcome email — it comes straight to us.',
            ],
        );
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = config('services.frontend_url');

        return (new MailMessage)
            ->subject('Welcome to GoCast — go live in under a minute')
            ->greeting("Hey {$notifiable->name},")
            ->line("Your GoCast account is ready. You're one click away from broadcasting live to anyone with a browser.")
            ->action('Create your first station', "{$frontendUrl}/dashboard/stations")
            ->line('No installs, no plugins. Just hit go live and share your station link with your audience.')
            ->line('Questions or feedback? Reply to this email — it goes straight to us.')
            ->salutation('— The GoCast team');
    }
}
