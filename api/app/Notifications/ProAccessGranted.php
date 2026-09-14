<?php

namespace App\Notifications;

use App\Models\Plan;
use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Tells someone their access request was granted.
 *
 * Worth sending rather than letting them notice: nothing about a grant is
 * pushed to the dashboard. The UI only reflects the new plan on the next load
 * of /api/user, so without this email the upgrade is something they stumble
 * into days later — hence the "refresh the page" line.
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
 * The "3 months" is a promise made by this email and nothing else: no code
 * expires a plan, so ending the term is an admin revoking the request by
 * hand from the review queue.
 *
 * Queued because it is dispatched from the admin request that records the
 * grant, and a slow or unreachable mail host must not make approving somebody
 * look like it failed — the plan change is already committed by then.
 */
class ProAccessGranted extends BellNotification implements ShouldQueue
{
    use Queueable;

    private const SOCIALS = [
        'X' => 'https://x.com/gocastfm',
        'Facebook' => 'https://www.facebook.com/gocast.fm/',
        'Instagram' => 'https://www.instagram.com/gocastfm/',
    ];

    public function __construct(private readonly Plan $plan) {}

    /**
     * @return list<string>
     */
    protected function alsoVia(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * The bell answers the complaint in the class docblock directly: nothing
     * about a grant was ever pushed to the dashboard, so the email had to ask
     * people to refresh the page. Now the dashboard says it too.
     *
     * Short where the email is long. The email is the onboarding document —
     * AutoDJ steps, the share link, the socials — and reproducing it in a
     * 400px dropdown would just be a worse copy of it. This says what changed
     * and points at the place to use it.
     */
    protected function toBell(object $notifiable): BellPayload
    {
        $station = $notifiable->stations()->first();
        $autoDj = $this->plan->autodj_enabled && $station !== null;

        // The AutoDJ clause is worded off the STATION, not just the plan, and
        // the button below is gated the same way. An account approved before
        // it has built anything does get AutoDJ, so the sentence still names
        // it — but "keeps your station playing" is a promise about a station
        // that does not exist yet, and the button would have nowhere to go.
        $body = 'Your request was approved — up to '
            .number_format($this->plan->max_listeners).' listeners at once';

        if ($this->plan->autodj_enabled) {
            $body .= $station !== null
                ? ', and AutoDJ keeps your station playing when you are not live.'
                : ', and AutoDJ to keep your station playing once you create one.';
        } else {
            $body .= '.';
        }

        // The points deliberately do NOT restate the body. The body is the row
        // and says what changed; these are the part of the email that has
        // never had anywhere to live in the dashboard — the term, and how to
        // actually start using AutoDJ. If they only repeated the sentence
        // above, opening the dialog would cost a click and tell you nothing,
        // which is the failure mode worth avoiding here.
        $points = ['Three months free — no card, nothing to pay.'];

        if ($autoDj) {
            $points[] = 'Upload audio to your library and AutoDJ starts playing it straight away.';
            $points[] = 'Jingles live on the same page — station IDs between tracks, never cutting into one.';
        } elseif ($this->plan->autodj_enabled) {
            // Plan carries AutoDJ but there is no station to point at yet, so
            // this says what is waiting rather than how to use it.
            $points[] = 'AutoDJ is ready as soon as you create your station.';
        }

        $points[] = 'Reply to the email we sent if anything looks wrong — it comes straight to us.';

        return new BellPayload(
            title: "You're on GoCast {$this->plan->name}",
            body: $body,
            icon: 'plan-upgraded',
            level: BellPayload::LEVEL_SUCCESS,
            category: BellPayload::CATEGORY_PLAN,
            actionLabel: $autoDj ? 'Open AutoDJ' : 'Open your dashboard',
            actionUrl: $autoDj
                ? BellPayload::appUrl("/dashboard/stations/{$station->slug}/library")
                : BellPayload::appUrl('/dashboard'),
            // Expands rather than linking: this is the one notification whose
            // email is an onboarding document, and the row has only ever been
            // able to carry its first sentence.
            actionMode: BellPayload::MODE_EXPAND,
            detailHeading: 'What you get',
            detailPoints: $points,
            meta: ['plan' => $this->plan->slug],
        );
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');

        // A user has one station (see the class comment), and by the time an
        // admin approves them they have always created it — the request form
        // lives inside the dashboard. The null branch is a guard against a
        // crash, not a case the copy is written for.
        $station = $notifiable->stations()->first();

        $message = (new MailMessage)
            ->subject("You're on GoCast {$this->plan->name} — 3 months on us")
            ->greeting("Hey {$notifiable->name},")
            ->line("Your request is approved. Your station is now on {$this->plan->name} for 3 months, free of charge.")
            ->line('If you already have the dashboard open, refresh the page to see the change.')
            ->line('**What you get**')
            ->line('- Up to '.number_format($this->plan->max_listeners).' listeners at once.');

        // Conditional because the plan decides it. Stating it unconditionally
        // would promise AutoDJ to anyone granted a plan that does not carry it.
        if ($this->plan->autodj_enabled) {
            $message
                ->line("- AutoDJ, so your station keeps playing when you're not live.")
                ->line('**Set up AutoDJ in one minute**')
                ->line('1. Open your library using the button below.')
                ->line('2. Select your audio files and upload them.')
                ->line("3. That's it. They start playing on your station right away.")
                ->line('4. Want station IDs or liners between songs? Open **Jingles** on the same page, upload them, and choose how often they play. They never cut into a track.');
        }

        if ($station) {
            $message
                // The library is owned per-station, so the link needs the slug;
                // /dashboard/library would work too but adds a redirect hop.
                ->action(
                    $this->plan->autodj_enabled ? 'Open AutoDJ' : 'Open your dashboard',
                    $this->plan->autodj_enabled
                        ? "{$frontendUrl}/dashboard/stations/{$station->slug}/library"
                        : "{$frontendUrl}/dashboard"
                )
                ->line('**Share your station**')
                ->line('This is your public link. Anyone can open it and listen, no account needed:')
                ->line("{$frontendUrl}/station/{$station->slug}")
                ->line("Share it with your listeners and friends so they can tune in. Put it in your Instagram bio, on your Facebook page, wherever you want. It's yours.");
        } else {
            $message->action('Open your dashboard', "{$frontendUrl}/dashboard");
        }

        $message->line('**Follow us for news and updates**');

        foreach (self::SOCIALS as $name => $url) {
            $message->line("- [{$name}]({$url})");
        }

        return $message
            ->line('Reply to this email if anything looks wrong — it comes straight to us.')
            ->salutation('— The GoCast team');
    }
}
