<?php

namespace App\Jobs;

use App\Models\Station;
use App\Models\StationNotifySubscription;
use App\Notifications\StationLiveNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Notification;

/**
 * Delayed guard for anonymous "notify me when live" opt-ins.
 *
 * A station can briefly flip live while a broadcaster tests mic/relay setup.
 * This job waits, then checks that the same session is still open before
 * sending listener emails.
 */
class SendStationLiveNotifications implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public string $stationId,
        public string $streamSessionId,
    ) {}

    public function handle(): void
    {
        $station = Station::query()->find($this->stationId);

        if (! $station?->is_live) {
            return;
        }

        $sessionStillOpen = $station->streamSessions()
            ->whereKey($this->streamSessionId)
            ->whereNull('ended_at')
            ->exists();

        if (! $sessionStillOpen) {
            return;
        }

        $notifiedAt = now();

        $station->notifySubscriptions()
            ->whereNull('notified_at')
            ->each(function (StationNotifySubscription $subscription) use ($station, $notifiedAt): void {
                Notification::route('mail', $subscription->email)
                    ->notify(new StationLiveNotification($station->name, $station->slug));

                $subscription->forceFill(['notified_at' => $notifiedAt])->save();
            });
    }
}
