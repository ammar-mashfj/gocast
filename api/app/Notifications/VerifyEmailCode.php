<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sends the 6-digit email verification code.
 *
 * Replaces Laravel's default signed-URL VerifyEmail notification; the user
 * types the code into the frontend, which POSTs to /api/email/verify.
 */
class VerifyEmailCode extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public string $code, public int $expiresInMinutes) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your GoCast verification code')
            ->greeting("Hey {$notifiable->name},")
            ->line('Enter this code in GoCast to verify your email address:')
            ->line("**{$this->code}**")
            ->line("The code expires in {$this->expiresInMinutes} minutes.")
            ->line("If you didn't request this, you can ignore this email.")
            ->salutation('— The GoCast team');
    }
}
