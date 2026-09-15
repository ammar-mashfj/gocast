<?php

namespace App\Notifications;

use App\Services\RawEmailSender;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

/**
 * An admin-composed email, delivered to one address.
 *
 * Routed with `Notification::route('mail', $email)` for the same reason as
 * {@see InviteOffer}: the recipient may have no account, and even when they do
 * this is mail about something the product has no opinion on. So NOTHING may be
 * read off `$notifiable` — every word comes from the {@see RawEmailDraft}, and
 * the address is a constructor argument so the unsubscribe link cannot end up
 * naming a different one than the envelope.
 *
 * ONE NOTIFICATION PER RECIPIENT, never a single send with several addresses on
 * it. Two reasons, and the first is the serious one: a shared To: line shows
 * every recipient their peers' addresses, which for a list of station owners is
 * a leak the admin cannot take back. The second is that the unsubscribe link has
 * to name one address to be signed for it.
 *
 * MARKETING VS OPERATIONAL is the only flag on the draft that changes what
 * leaves the building, and it decides three things together:
 *
 *   • whether the suppression list is consulted — see {@see RawEmailSender},
 *     which is where a suppressed address is actually dropped;
 *   • whether the footer carries an unsubscribe link;
 *   • whether the List-Unsubscribe headers are set, which is what puts Gmail's
 *     and Apple Mail's own opt-out button above the message.
 *
 * They move together because they are one question — "is this person hearing
 * from us because they chose to?" — and answering it differently in three
 * places is how a send ends up with a footer link and no header, or a header
 * on a password-reset-shaped email.
 *
 * Queued like every other mail notification here: a mail host that is refusing
 * connections must not make the admin panel report a failure for something the
 * queue will deliver a minute later.
 */
class RawEmail extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly RawEmailDraft $draft,
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
        $unsubscribeUrl = $this->draft->marketing ? $this->unsubscribeUrl() : null;

        $message = (new MailMessage)
            ->subject($this->draft->subject)
            // Array form: [html view, text view]. The plain-text half is not
            // optional — HTML alone is a spam signal, and it is what a
            // plain-text client and a screen reader actually get.
            ->view(['emails.raw', 'emails.raw-text'], $this->draft->viewData($unsubscribeUrl));

        if ($unsubscribeUrl === null) {
            return $message;
        }

        return $message->withSymfonyMessage(function ($message) use ($unsubscribeUrl) {
            $headers = $message->getHeaders();
            $headers->addTextHeader('List-Unsubscribe', "<{$unsubscribeUrl}>");
            $headers->addTextHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
        });
    }

    /**
     * A signed URL naming the address, so the opt-out cannot be forged and
     * cannot be aimed at somebody else.
     *
     * No `invite` parameter, unlike InviteOffer's — there is no link behind
     * this send to attribute the no to, and UnsubscribeController treats that
     * parameter as optional. The suppression is recorded either way, and the
     * suppression list is the thing that stops the next send.
     *
     * Not expiring: an unsubscribe link that has gone stale is worse than
     * useless, because the person clicking it has already decided.
     */
    private function unsubscribeUrl(): string
    {
        return URL::signedRoute('unsubscribe', ['email' => $this->email]);
    }
}
