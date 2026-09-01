<?php

namespace App\Notifications;

use App\Models\Plan;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells someone their access request was granted.
 *
 * Worth sending rather than letting them notice: nothing about a grant is
 * pushed to the dashboard. The UI only reflects the new plan on the next load
 * of /api/user, so without this email the upgrade is something they stumble
 * into days later.
 *
 * What it may claim is narrower than what the `plans` row holds. `max_stations`
 * reads 5 on Pro and is enforced by StoreStationRequest, but the product is one
 * station per user — see client/lib/station-server.ts, which resolves "the
 * user's station", singular. The column is stale, so quoting it here would
 * promise four stations that nothing in the app will ever let them create.
 * The watermark is likewise not a real difference today: no clips are
 * installed, so it is inert on every plan.
 *
 * That leaves the two entitlements that are actually live and actually differ:
 * AutoDJ and the concurrent listener cap.
 *
 * Queued because it is dispatched from the admin request that records the
 * grant, and a slow or unreachable mail host must not make approving somebody
 * look like it failed — the plan change is already committed by then.
 */
class ProAccessGranted extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private readonly Plan $plan) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = config('services.frontend_url');

        $message = (new MailMessage)
            ->subject("You're on GoCast {$this->plan->name}")
            ->greeting("Hey {$notifiable->name},")
            ->line("Your request is approved — your account is on {$this->plan->name} as of now.")
            ->line("Your station can now take up to {$this->plan->max_listeners} listeners at once.");

        // Conditional because the plan decides it. Stating it unconditionally
        // would promise AutoDJ to anyone granted a plan that does not carry it.
        if ($this->plan->autodj_enabled) {
            $message->line('AutoDJ is unlocked too: upload your library and your station keeps playing when you are not live.');
        }

        // /dashboard, not /dashboard/stations: the latter is a legacy URL kept
        // only as a redirect, and /dashboard is the one route that resolves
        // which station is theirs.
        return $message
            ->action('Open your dashboard', "{$frontendUrl}/dashboard")
            ->line('Reply to this email if anything looks wrong — it comes straight to us.')
            ->salutation('— The GoCast team');
    }
}
