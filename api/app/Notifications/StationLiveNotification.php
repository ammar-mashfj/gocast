<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent to anonymous listener opt-ins when a station starts a new live session.
 */
class StationLiveNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public string $stationName,
        public string $stationSlug,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        $stationUrl = "{$frontendUrl}/station/{$this->stationSlug}";

        return (new MailMessage)
            ->subject("{$this->stationName} is live on GoCast")
            ->greeting('Hey,')
            ->line("{$this->stationName} just went live.")
            ->action('Listen now', $stationUrl)
            ->line('You asked us to let you know when this station started broadcasting.')
            ->salutation('— The GoCast team');
    }
}
