<?php

namespace App\Services;

use App\Models\EmailSuppression;
use App\Notifications\RawEmail;
use App\Notifications\RawEmailDraft;
use Illuminate\Support\Facades\Notification;

/**
 * Puts one admin-composed draft in front of a list of addresses.
 *
 * Separate from the controller for the reason AnnouncementSender is: the page
 * has to be able to say what a send WILL do before it does it, and a plan that
 * is computed by different code from the send is a plan that can disagree with
 * it. {@see plan()} and {@see send()} partition the same list with the same
 * rule, and the preview screen shows the first.
 *
 * ONE SEND PER ADDRESS. Never a single message with several recipients on it:
 * a shared To: line shows every recipient their peers' addresses, which for a
 * list of station owners is a leak that cannot be taken back.
 */
class RawEmailSender
{
    /**
     * Split the list into who will be written to and who will not.
     *
     * The suppression list governs MARKETING mail only, which is the same line
     * it has always drawn — see the create_email_suppressions_table notes. A
     * person who opted out of outreach has said nothing about the reply to
     * their own support email, and silently dropping that would be a worse
     * failure than the one the list exists to prevent.
     *
     * @param  list<string>  $recipients
     * @return array{send: list<string>, suppressed: list<string>}
     */
    public function plan(RawEmailDraft $draft, array $recipients): array
    {
        if (! $draft->marketing) {
            return ['send' => $recipients, 'suppressed' => []];
        }

        $suppressed = EmailSuppression::query()
            ->whereIn('email', $recipients)
            ->pluck('email')
            // Lowercased on both sides: the SQL comparison above is
            // case-insensitive by collation, but PHP's is not, so the stored
            // casing must not decide whether an address is dropped.
            ->map(fn (string $email) => mb_strtolower($email))
            ->all();

        $partitioned = collect($recipients)
            ->partition(fn (string $email) => in_array(mb_strtolower($email), $suppressed, true));

        return [
            'suppressed' => $partitioned[0]->values()->all(),
            'send' => $partitioned[1]->values()->all(),
        ];
    }

    /**
     * Queue the mail.
     *
     * Returns the same two lists {@see plan()} does, so the flash message
     * reports what happened rather than what was asked for. The plan is
     * recomputed here rather than passed in: the preview and the send are two
     * requests, and somebody can unsubscribe in between.
     *
     * @param  list<string>  $recipients
     * @return array{sent: list<string>, suppressed: list<string>}
     */
    public function send(RawEmailDraft $draft, array $recipients): array
    {
        $planned = $this->plan($draft, $recipients);

        foreach ($planned['send'] as $email) {
            // Routed rather than notified through a User: the address may have
            // no account, and even when it does this is mail about something
            // the product has no opinion on.
            Notification::route('mail', $email)->notify(new RawEmail($draft, $email));
        }

        return ['sent' => $planned['send'], 'suppressed' => $planned['suppressed']];
    }
}
