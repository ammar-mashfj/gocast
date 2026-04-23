<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent immediately after a new user verifies their email.
 *
 * Anchored on the verification event (not registration) so the user is
 * actually reachable — and so we don't double-send for OAuth signups
 * where the email is auto-verified.
 */
class WelcomeNotification extends Notification
{
    use Queueable;

    public function via(object $notifiable): array
    {
        return ['mail'];
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
