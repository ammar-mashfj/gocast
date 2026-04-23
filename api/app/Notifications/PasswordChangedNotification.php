<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Out-of-band alert sent when a user's password changes.
 *
 * Purpose is detection: if an attacker hijacks a session and rotates the
 * password, the real account owner learns about it in their inbox and can
 * contact support before the attacker fully takes over.
 */
class PasswordChangedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public ?string $ip = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject('Your GoCast password was changed')
            ->greeting("Hey {$notifiable->name},")
            ->line('Your GoCast password was just changed.');

        if ($this->ip) {
            $message->line("Request came from IP: {$this->ip}");
        }

        return $message
            ->line("If this wasn't you, reply to this email immediately — we'll lock your account and help you recover it.")
            ->salutation('— The GoCast team');
    }
}
