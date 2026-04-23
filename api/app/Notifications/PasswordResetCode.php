<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sends the 6-digit password-reset code.
 *
 * The user enters their email on /auth/forgot, gets this mail, then submits
 * the code + a new password. Consistent with the email verification flow —
 * no link clicks, everything happens in-app.
 */
class PasswordResetCode extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public string $code, public int $expiresInMinutes) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $greeting = isset($notifiable->name) ? "Hey {$notifiable->name}," : 'Hey,';

        return (new MailMessage)
            ->subject('Your GoCast password reset code')
            ->greeting($greeting)
            ->line('Someone requested a password reset for this email address. Use this code in GoCast to set a new password:')
            ->line("**{$this->code}**")
            ->line("The code expires in {$this->expiresInMinutes} minutes.")
            ->line("If you didn't request this, you can ignore this email — your password stays the same.")
            ->salutation('— The GoCast team');
    }
}
