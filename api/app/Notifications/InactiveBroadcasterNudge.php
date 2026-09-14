<?php

namespace App\Notifications;

use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Sent ~7 days after signup to users who haven't started a single broadcast.
 *
 * Once-per-user (we check the notifications table to avoid resending) — soft
 * nudge with a direct link into the go-live flow for one of their stations,
 * or to the create-station flow if they haven't built one yet.
 *
 * THAT IDEMPOTENCY CHECK ONLY STARTED WORKING when this became a bell
 * notification. NudgeInactiveBroadcasters asks whether a row of this type
 * exists in `notifications` before sending, and while this was mail-only it
 * never wrote one — so the guard read every user as un-nudged and the
 * command was relying entirely on its one-day candidate window to avoid
 * sending twice. Adding the database channel is what makes the check true.
 * See config/notifications.php: the retention window has to stay clear of
 * that command's window for it to stay true.
 *
 * WHICH IS ALSO WHY THIS IS ShouldQueue, and why it has to stay that way.
 * Laravel queues a notification one job per channel, so the bell row and the
 * email become independent and independently retryable. Sent inline they are
 * one call with `database` first: the row — the idempotency guard above —
 * commits, and then a mail host that throws takes the exception out through
 * `notify()`. The user is marked nudged forever and never gets the email, and
 * the exception aborts NudgeInactiveBroadcasters mid-sweep, so everyone after
 * them in the batch is skipped and has aged out of its one-day candidate
 * window by the next run. Queued, a mail failure is one retryable job.
 */
class InactiveBroadcasterNudge extends BellNotification implements ShouldQueue
{
    use Queueable;

    public function __construct(public ?string $stationSlug = null) {}

    /**
     * @return list<string>
     */
    protected function alsoVia(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * The one notification here whose bell copy is doing different work from
     * its email. The email has to re-introduce itself to someone who signed up
     * a week ago and left; the bell is read by someone who has come back and is
     * already looking at the dashboard, so it skips the reintroduction and is
     * just the nudge and the button.
     */
    protected function toBell(object $notifiable): BellPayload
    {
        return new BellPayload(
            title: 'Ready for your first broadcast?',
            body: 'The hardest part is hitting the button. Once you do, listeners can tune in from any browser with one shareable link.',
            icon: 'microphone',
            level: BellPayload::LEVEL_INFO,
            category: BellPayload::CATEGORY_STATION,
            actionLabel: $this->stationSlug ? 'Go live now' : 'Create your first station',
            actionUrl: $this->stationSlug
                ? BellPayload::appUrl("/dashboard/stations/{$this->stationSlug}/live")
                : BellPayload::appUrl('/dashboard/stations'),
            meta: ['station' => $this->stationSlug],
        );
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
