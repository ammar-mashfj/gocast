<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class AdminLoginAbuseDetected extends Notification
{
    use Queueable;

    public function __construct(
        public string $ip,
        public int $attempts,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toDatabase(object $notifiable): array
    {
        return [
            'title' => 'Admin login abuse detected',
            'body' => "IP {$this->ip} failed {$this->attempts} admin logins in the last hour.",
            'color' => 'danger',
            'icon' => 'heroicon-o-shield-exclamation',
            'ip' => $this->ip,
            'attempts' => $this->attempts,
        ];
    }
}
