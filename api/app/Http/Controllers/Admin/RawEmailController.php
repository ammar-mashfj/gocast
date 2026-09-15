<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SendRawEmailRequest;
use App\Notifications\RawEmailDraft;
use App\Services\RawEmailSender;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\URL;
use Illuminate\View\View;
use InvalidArgumentException;
use Spatie\Activitylog\Models\Activity;

/**
 * Writes one email, by hand, to a handful of addresses.
 *
 * WHAT THIS PAGE IS FOR is the mail with no template because it happens once:
 * a reply to somebody who wrote in, a heads-up to the four people on a beta,
 * a note to a station owner about their own account. It exists because the
 * alternative is sending that from a personal mailbox, which arrives without
 * the shell, without the unsubscribe headers, and from a domain nobody
 * recognises.
 *
 * WHAT IT IS NOT is the announcements page in another format. That one writes
 * into every bell on the platform and takes no addresses; this one takes an
 * explicit list and reaches nobody who is not on it. When the thing to say is
 * about GoCast rather than about these people, it belongs there — it is seen
 * by everybody, including the accounts whose address bounces.
 *
 * TWO STEPS, AND THE SECOND ONE IS THE POINT. Mail does not come back. The
 * preview is not a nicety here: this is the one composer in the panel where
 * what the admin typed and what the recipient sees are rendered by different
 * code, so the only way to know a paragraph break landed, or that the button
 * has a label, is to look at the thing itself. So composing and sending are
 * separate requests with the rendered email in between — the same shape as
 * {@see AnnouncementController}, for the same reason.
 *
 * @see RawEmailSender for the fan-out and the suppression rule.
 * @see RawEmailDraft for what the body is allowed to contain, and why it is
 *      not HTML.
 */
class RawEmailController extends Controller
{
    public function index(): View
    {
        return view('admin.emails', [
            'sent' => $this->history(),
            'maxRecipients' => SendRawEmailRequest::MAX_RECIPIENTS,
            'defaultSignOff' => RawEmailDraft::SIGN_OFF,
        ]);
    }

    /**
     * Step one: render the actual email and say who it is going to.
     */
    public function preview(SendRawEmailRequest $request, RawEmailSender $sender): View|RedirectResponse
    {
        $fields = $request->validated();

        try {
            $draft = RawEmailDraft::fromArray($fields);
        } catch (InvalidArgumentException $e) {
            // The form request's rules mirror the draft's own, so this is the
            // combination neither of them anticipated rather than ordinary
            // invalid input — a body of nothing but blank lines, say, which
            // passes `required` and produces no paragraphs.
            return back()->withInput()->withErrors(['body' => $e->getMessage()]);
        }

        $recipients = $fields['recipients'];
        $planned = $sender->plan($draft, $recipients);

        // Signed for the first recipient, so the preview's footer link is a
        // real one rather than a placeholder — clicking it in the preview
        // would genuinely unsubscribe that address, which is worth knowing and
        // is why the preview renders inside a sandboxed frame.
        $unsubscribeUrl = $draft->marketing && $planned['send'] !== []
            ? URL::signedRoute('unsubscribe', ['email' => $planned['send'][0]])
            : null;

        return view('admin.email-preview', [
            // Rendered from the draft rather than from the form fields, so
            // what is on screen is what will be sent — defaults included. A
            // preview built from the input would agree with the form and
            // disagree with the mail.
            'html' => view('emails.raw', $draft->viewData($unsubscribeUrl))->render(),
            'text' => view('emails.raw-text', $draft->viewData($unsubscribeUrl))->render(),
            'draft' => $draft,
            // Carried through as hidden inputs so the send posts the thing
            // that was previewed, not a fresh interpretation of it.
            'fields' => $draft->toForm(),
            'recipients' => $recipients,
            'willSend' => $planned['send'],
            'suppressed' => $planned['suppressed'],
        ]);
    }

    /**
     * Step two: send it.
     */
    public function store(SendRawEmailRequest $request, RawEmailSender $sender): RedirectResponse
    {
        $fields = $request->validated();

        try {
            $draft = RawEmailDraft::fromArray($fields);
        } catch (InvalidArgumentException $e) {
            return back()->withInput()->withErrors(['body' => $e->getMessage()]);
        }

        $result = $sender->send($draft, $fields['recipients']);

        // Same reason as InviteController and AnnouncementController:
        // LogsActivity resolves its causer off the default guard, which is
        // never the admin guard. Without this, mail leaving the platform under
        // its own domain has no record of who sent it.
        //
        // THE ADDRESSES ARE IN THE PROPERTIES, and that is the whole value of
        // the entry: the one question asked afterwards is "did this go to
        // them?", and a count cannot answer it. The body is not — it is in
        // their inbox, and the activity log is not an archive.
        activity()
            ->causedBy($request->user('admin'))
            ->withProperties([
                'subject' => $draft->subject,
                'marketing' => $draft->marketing,
                'sent' => $result['sent'],
                'suppressed' => $result['suppressed'],
            ])
            ->log('sent email');

        return redirect()
            ->route('admin.emails.index')
            ->with('status', $this->outcome($result));
    }

    /**
     * What to say about a send that is now on the queue.
     *
     * A send that reached nobody is reported as such rather than as a success,
     * because from here the two look identical and the cause is always the
     * same one: every address on the list had already unsubscribed.
     *
     * @param  array{sent: list<string>, suppressed: list<string>}  $result
     */
    private function outcome(array $result): string
    {
        $sent = count($result['sent']);
        $suppressed = count($result['suppressed']);

        if ($sent === 0) {
            return $suppressed === 1
                ? "Nothing sent — {$result['suppressed'][0]} has unsubscribed."
                : "Nothing sent — all {$suppressed} addresses have unsubscribed.";
        }

        $message = $sent === 1
            ? "Queued for {$result['sent'][0]}."
            : "Queued for {$sent} addresses.";

        return $suppressed === 0
            ? $message
            : $message." Skipped {$suppressed} who ".($suppressed === 1 ? 'has' : 'have').' unsubscribed.';
    }

    /**
     * Emails already sent from this page, newest first.
     *
     * Read off the activity log rather than a table of its own, because the
     * log is already the answer to the only question this list is for — "has
     * this gone out, and to whom?" — and a second store of the same facts is
     * a second thing to keep in step with it.
     *
     * Capped at fifteen and not paginated: anybody looking further back than
     * that wants the activity log itself, which is where this came from.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function history(): Collection
    {
        return Activity::query()
            ->where('description', 'sent email')
            ->with('causer')
            ->latest()
            ->limit(15)
            ->get()
            ->map(fn (Activity $entry) => [
                'subject' => $entry->properties['subject'] ?? '—',
                'marketing' => (bool) ($entry->properties['marketing'] ?? false),
                'recipients' => (array) ($entry->properties['sent'] ?? []),
                'suppressed' => count((array) ($entry->properties['suppressed'] ?? [])),
                'by' => $entry->causer?->email,
                'at' => $entry->created_at,
            ]);
    }
}
