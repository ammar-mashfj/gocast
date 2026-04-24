<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent ~7 days after signup to users who haven't started a single broadcast.
 *
 * Once-per-user (we check the notifications table to avoid resending) — soft
 * nudge with a direct link into the go-live flow for one of their stations,
 * or to the create-station flow if they haven't built one yet.
 */
class InactiveBroadcasterNudge extends Notification
{
    use Queueable;

    public function __construct(public ?string $stationSlug = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = config('services.frontend_url');
        $cta = $this->stationSlug
            ? "{$frontendUrl}/dashboard/stations/{$this->stationSlug}/live"
            : "{$frontendUrl}/dashboard/stations";
        $ctaLabel = $this->stationSlug ? 'Go live now' : 'Create your first station';

        return (new MailMessage)
            ->subject('Ready for your first broadcast on GoCast?')
            ->greeting("Hey {$notifiable->name},")
            ->line("You signed up about a week ago and haven't gone live yet — totally fine, but we wanted to check in.")
            ->line('The hardest part is hitting the button. Once you do, listeners can tune in from any browser with one shareable link.')
            ->action($ctaLabel, $cta)
            ->line("If something is blocking you (mic permissions, finding what to broadcast, anything), just reply — we're real humans.")
            ->salutation('— The GoCast team');
    }
}
