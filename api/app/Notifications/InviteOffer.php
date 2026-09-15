<?php

namespace App\Notifications;

use App\Models\Invite;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

/**
 * The invite link itself, delivered.
 *
 * Sent from the admin panel to an address that almost never has an account
 * behind it — this is outreach, and the whole point of an invite is that the
 * recipient is a stranger. So it is routed with
 * `Notification::route('mail', $email)` onto an AnonymousNotifiable, which
 * means NOTHING may be read off `$notifiable`: no name, no plan, no stations.
 * Everything the copy needs comes from the Invite passed to the constructor.
 *
 * For the same reason it is not a BellNotification: there is no account to put
 * a bell row on. Its sibling {@see InviteRedeemed} is the one with a bell,
 * because by then the person exists.
 *
 * A HAND-BUILT TEMPLATE, NOT MARKDOWN. Every other notification here renders
 * through Laravel's markdown mail, which is right for mail to people who
 * already use the product. This one is the first thing a stranger sees, so it
 * is the designed email — resources/views/emails/invite.blade.php, with the
 * plain-text half beside it. This class assembles the handful of values that
 * vary and decides nothing about layout.
 *
 * WHAT IT DOES NOT DO is promise anything the link cannot keep. The plan, the
 * term and the deadline are all read off the invite rather than written into
 * the template, so an invite minted for Free on an open-ended link does not
 * receive an email about three months of Pro. The one claim made by the email
 * and not by the code is that a person is behind it.
 *
 * Queued, like every other mail notification here: an unreachable SMTP host
 * must not make minting a link look like it failed, when the link is already
 * in the database and already works.
 */
class InviteOffer extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * The address is a constructor argument rather than something read back
     * off the invite or off the notifiable: this notification is always sent
     * to one address, the unsubscribe link has to name that same address, and
     * making both come from one parameter removes the ordering bug where the
     * link is built before the column is written.
     */
    public function __construct(
        private readonly Invite $invite,
        private readonly string $email,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $unsubscribeUrl = $this->unsubscribeUrl();
        $caption = $this->planCaption();

        return (new MailMessage)
            ->subject('Your GoCast invite')
            // Array form: [html view, text view]. The plain-text half is not
            // optional on cold mail — HTML alone is a spam signal, and it is
            // what a plain-text client actually shows.
            ->view(['emails.invite', 'emails.invite-text'], [
                // "Hi Rae," when we know who we are writing to. The fallback
                // is deliberately not built from `label`, which is the
                // admin's private note and as likely to say "found on
                // SoundCloud" as anybody's name.
                'greeting' => $this->invite->recipient_name
                    ? "Hi {$this->invite->recipient_name},"
                    : 'Hi there,',
                'note' => $this->invite->personal_note,
                'inviteUrl' => $this->invite->url(),
                'planCaption' => $caption,
                'deadline' => $this->deadline(),
                'preheader' => "Your own station, on air 24/7 — {$caption}",
                'unsubscribeUrl' => $unsubscribeUrl,
                'siteUrl' => 'https://gocast.fm',
            ])
            // The headers are the half of the opt-out that most recipients
            // actually use: they put Gmail's and Apple Mail's own unsubscribe
            // button above the message, which is both easier for the reader
            // and what those providers now expect from bulk senders. Without
            // them the footer link is the only way out, and a reader who
            // cannot find it reaches for "report spam" instead — which costs
            // the sending domain far more than an opt-out does.
            ->withSymfonyMessage(function ($message) use ($unsubscribeUrl) {
                $headers = $message->getHeaders();
                $headers->addTextHeader('List-Unsubscribe', "<{$unsubscribeUrl}>");
                $headers->addTextHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
            });
    }

    /**
     * The line under the button: what they are being given, in their words
     * rather than the schema's.
     *
     * Months when the term divides into them, because "3 months of Pro" is
     * how the offer was described to them and "90 days of Pro" is how the
     * database happens to store it. Anything else is left in days rather than
     * rounded — a 45-day invite saying "1 month" would be a small lie in the
     * one sentence that has to be exact.
     */
    private function planCaption(): string
    {
        $plan = $this->invite->plan?->name ?? 'GoCast';
        $days = $this->invite->duration_days;

        if ($days === null) {
            return "{$plan}, free. No card required.";
        }

        if ($days % 30 === 0) {
            $months = intdiv($days, 30);
            $term = $months === 1 ? '1 month' : "{$months} months";
        } else {
            $term = $days === 1 ? '1 day' : "{$days} days";
        }

        return "{$term} of {$plan}, free. No card required.";
    }

    /**
     * When the LINK stops working — a different promise from the term above,
     * and stated only when the invite carries one.
     */
    private function deadline(): ?string
    {
        return $this->invite->expires_at
            ? 'Open until '.$this->invite->expires_at->toFormattedDateString().'.'
            : null;
    }

    /**
     * A signed URL naming the address, so the opt-out cannot be forged and
     * cannot be aimed at somebody else. Carries the code as well, which is
     * how the suppression records which send prompted it.
     *
     * Not expiring: an unsubscribe link that has gone stale is worse than
     * useless, because the person clicking it has already decided.
     */
    private function unsubscribeUrl(): string
    {
        return URL::signedRoute('unsubscribe', [
            'email' => $this->email,
            'invite' => $this->invite->code,
        ]);
    }
}
