<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent to the *previous* email address after a verified user changes their
 * email. The new address receives the standard verification code flow; this
 * out-of-band alert lets the original owner detect an unauthorised change.
 *
 * Routed with Notification::route('mail', $oldEmail) so it delivers to the
 * old address rather than the user's current (already-updated) record.
 */
class EmailChangedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public string $name, public string $newEmail) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your GoCast email address was changed')
            ->greeting("Hey {$this->name},")
            ->line('The email address on your GoCast account was just changed.')
            ->line("New address: **{$this->newEmail}**")
            ->line("If this wasn't you, reply to this email immediately — we'll reverse the change and secure your account.")
            ->salutation('— The GoCast team');
    }
}
