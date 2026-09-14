<?php

namespace App\Notifications;

use App\Models\Plan;
use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

/**
 * The welcome for an account that arrived through an invite link.
 *
 * Replaces WelcomeNotification for those accounts rather than adding to it:
 * the generic welcome says "create your first station", and this says the same
 * thing plus what the plan gives them, so sending both would be two emails
 * making one point. Sent from the Verified listener for a sign-up (the address
 * is only reachable after the code is entered) and from InviteRedemption
 * directly for an account that was already verified.
 *
 * Unlike ProAccessGranted it cannot assume a station exists — an invited
 * user has just registered and has none — so the AutoDJ steps start with
 * creating one, and the action lands on the stations page rather than a
 * library that is not there yet.
 *
 * Only the entitlements that really differ today are named: AutoDJ and the
 * listener cap. See ProAccessGranted for why `max_stations` is not quoted.
 */
class InviteRedeemed extends BellNotification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly Plan $plan,
        private readonly ?Carbon $until,
    ) {}

    /**
     * @return list<string>
     */
    protected function alsoVia(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * Same reasoning as the email it accompanies: an invited account is on a
     * plan it did not pick, and nothing else in the dashboard says so.
     *
     * The end date is repeated here when there is one, because that is the
     * part people forget — the email is read once, on the day it arrives, and
     * the bell is where the answer is two months later.
     */
    protected function toBell(object $notifiable): BellPayload
    {
        $body = "Your account is on GoCast {$this->plan->name}, free of charge.";

        if ($this->until) {
            $body .= " It runs until {$this->until->toFormattedDateString()}.";
        }

        $points = ['Up to '.number_format($this->plan->max_listeners).' listeners at once.'];

        if ($this->plan->autodj_enabled) {
            $points[] = 'AutoDJ, so your station keeps playing when you are not live.';
        }

        // The steps START AT CREATING A STATION, unlike the ones in
        // ProAccessGranted. An invited account has just registered and has
        // nothing yet, which is the same reason the button below goes to the
        // stations page rather than to a library.
        $points[] = 'Create your station, then upload audio to its library — it starts playing straight away.';

        if ($this->plan->autodj_enabled) {
            $points[] = 'Jingles live on the same page: station IDs between tracks, never cutting into one.';
        }

        return new BellPayload(
            title: "Welcome to GoCast {$this->plan->name}",
            body: $body,
            icon: 'invite',
            level: BellPayload::LEVEL_SUCCESS,
            category: BellPayload::CATEGORY_PLAN,
            // Not the library, unlike ProAccessGranted: an invited account has
            // just registered and has no station for a library to belong to.
            actionLabel: 'Create your station',
            actionUrl: BellPayload::appUrl('/dashboard/stations'),
            // The email is an onboarding document and the row is one sentence
            // of it. Same reasoning as ProAccessGranted — with more force
            // here, because this account has never seen the product before.
            actionMode: BellPayload::MODE_EXPAND,
            detailHeading: 'What you get',
            detailPoints: $points,
            meta: [
                'plan' => $this->plan->slug,
                'expires_at' => $this->until?->toIso8601String(),
            ],
        );
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');

        $message = (new MailMessage)
            ->subject("Welcome to GoCast {$this->plan->name}")
            ->greeting("Hey {$notifiable->name},")
            ->line("Your invite is in. Your account is on GoCast {$this->plan->name}, free of charge.");

        // The promise is only made when the code will keep it: `until` is set
        // from the invite's duration and enforced by plans:expire.
        if ($this->until) {
            $message->line("{$this->plan->name} runs until **{$this->until->toFormattedDateString()}**.");
        }

        $message
            ->line('**What you get**')
            ->line('- Up to '.number_format($this->plan->max_listeners).' listeners at once.');

        if ($this->plan->autodj_enabled) {
            $message
                ->line("- AutoDJ, so your station keeps playing when you're not live.")
                ->line('**Get on air in a minute**')
                ->line('1. Create your station using the button below.')
                ->line('2. Open its library, select your audio files and upload them.')
                ->line("3. That's it. They start playing on your station right away.")
                ->line('4. Want station IDs or liners between songs? Open **Jingles** on the same page, upload them, and choose how often they play. They never cut into a track.');
        }

        return $message
            ->action('Create your station', "{$frontendUrl}/dashboard/stations")
            ->line("Once it exists, your station has a public link anyone can open and listen to, no account needed. Put it in your bio, on your page, wherever you want. It's yours.")
            ->line('Reply to this email if anything looks wrong — it comes straight to us.')
            ->salutation('— The GoCast team');
    }
}
