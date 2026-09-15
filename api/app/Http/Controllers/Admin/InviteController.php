<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreInviteRequest;
use App\Models\Admin;
use App\Models\EmailSuppression;
use App\Models\Invite;
use App\Models\Plan;
use App\Notifications\InviteOffer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\View\View;

/**
 * Mints invite links, sends them, and shows what became of them.
 *
 * The page is a form and a table on purpose: the whole workflow is "make a
 * link, get it to somebody, and later see whether they took it". Anything
 * more (editing a code, reassigning it) would be a second way to do what
 * minting another link already does.
 *
 * SENDING IS PART OF MINTING, not a second page. Fill in an address and the
 * link is emailed as the invite is created; leave it blank and the link is
 * only shown, which is still the right way to send one that needs a paragraph
 * of your own around it. `send` exists for the two cases the form cannot
 * cover: the address was wrong, and nobody clicked. Both are the same act —
 * put this link in front of that address again — so they are one route.
 *
 * What sending does NOT do is bind the invite to the address. Redemption
 * never looks at `email`; see the create_invites_table notes on forwarded
 * links. A resend to a different address does not take the link away from the
 * first one, and the copy in the email says as much.
 *
 * Revoking sets `expires_at` to now rather than deleting the row, so a link
 * sent to the wrong person stops working while the record of it having existed
 * stays — and any account it already brought in keeps its `invite_id`.
 */
class InviteController extends Controller
{
    public function index(Request $request): View
    {
        $invites = Invite::query()
            ->with([
                'plan:id,name,slug',
                'creator:id,name',
                // Attribution: who each link brought in. Loaded whole because
                // the table renders name, email and plan for every redeemer.
                'users' => fn ($query) => $query->with('plan:id,name')->orderBy('created_at'),
            ])
            ->latest()
            ->paginate(25)
            ->withQueryString();

        return view('admin.invites', [
            'invites' => $invites,
            // One query for the whole page rather than a lookup per row. The
            // page has to show this: without it, an invite that will never
            // send looks exactly like one that has simply not been sent yet,
            // and the admin's next move is to click Send again.
            'suppressed' => EmailSuppression::query()
                ->whereIn('email', $invites->pluck('email')->filter()->all())
                ->pluck('email')
                // Lowercased both here and at the callsite: the SQL comparison
                // above is case-insensitive by collation, but PHP's is not,
                // so the stored casing must not decide whether the badge shows.
                ->map(fn (string $email) => mb_strtolower($email))
                ->all(),
            'plans' => Plan::orderBy('id')->get(),
            'defaultPlanId' => Plan::where('slug', 'pro')->value('id') ?? Plan::min('id'),
            // Survives the redirect once, so the link just minted is at the top
            // of the page with a copy button and not buried in the table.
            'minted' => $request->session()->get('minted'),
            'totalInvites' => Invite::count(),
            'redeemedInvites' => Invite::where('uses', '>', 0)->count(),
            'openInvites' => Invite::redeemable()->count(),
        ]);
    }

    public function store(StoreInviteRequest $request): RedirectResponse
    {
        $data = $request->validated();

        $plan = Plan::findOrFail((int) $data['plan_id']);

        $invite = Invite::create([
            // A typed code wins. Otherwise one is built from the label, so a
            // link for "DJ Ammar" reads DJ-Ammar-GoCast-Pro rather than twenty
            // random characters; with no label either, it is random. Never
            // lowercased or otherwise normalised, so the link reads exactly as
            // it was typed.
            'code' => $data['code'] ?? Invite::codeFor($data['label'] ?? null, $plan),
            'plan_id' => $plan->id,
            'duration_days' => $data['duration_days'] ?? null,
            'label' => $data['label'] ?? null,
            // Stored before the send, so an invite whose email fails to queue
            // still remembers who it was for.
            'email' => $data['email'] ?? null,
            'recipient_name' => $data['recipient_name'] ?? null,
            'personal_note' => $data['personal_note'] ?? null,
            'max_uses' => (int) $data['max_uses'],
            'expires_at' => isset($data['link_expires_in_days'])
                ? now()->addDays((int) $data['link_expires_in_days'])
                : null,
            'created_by' => $request->user('admin')->id,
        ]);

        // Same reason as AccountController: LogsActivity resolves its causer
        // off the default guard, which is never the admin guard, so without
        // this the log shows a paid-plan link appearing from nowhere.
        activity()
            ->causedBy($request->user('admin'))
            ->performedOn($invite)
            ->withProperties(['plan' => $invite->plan?->slug, 'label' => $invite->label])
            ->log('minted invite');

        // After the log, so a send that throws still leaves a record of the
        // link having been minted — which it was, and it works whether or not
        // the email ever goes out.
        $sent = $invite->email !== null
            && $this->deliver($invite, $invite->email, $request->user('admin'));

        $redirect = redirect()
            ->route('admin.invites.index')
            ->with('minted', [
                'id' => $invite->id,
                'url' => $invite->url(),
                'label' => $invite->label,
                'plan' => $invite->plan?->name,
                // Only the address we actually wrote to. An unsubscribed one
                // is reported separately, because a green card saying "Invite
                // sent" when nothing was sent is the exact failure this whole
                // list exists to avoid.
                'email' => $sent ? $invite->email : null,
            ]);

        if ($invite->email !== null && ! $sent) {
            return $redirect->with('status', "{$invite->email} has unsubscribed, so nothing was emailed. The link is minted — send it yourself if you have another way to reach them.");
        }

        return $redirect;
    }

    /**
     * Send (or resend) the link to an address.
     *
     * Refuses a closed link rather than silently mailing a dead one: the
     * recipient of that email has no way to tell it was never going to work,
     * and the admin's next move is to mint a fresh invite, not to wonder why
     * nobody signed up.
     *
     * Overwrites `email` when a different address is given, because the column
     * is "who this was last sent to" and the table showing the old address
     * after a correction would be worse than showing none.
     */
    public function send(Request $request, Invite $invite): RedirectResponse
    {
        $validated = $request->validate([
            // Required here, unlike on the mint form: this route exists to
            // send, so there is no sensible reading of an empty address.
            'email' => ['required', 'string', 'email', 'max:255'],
        ]);

        if (! $invite->isRedeemable()) {
            return back()->with('status', 'That invite is closed, so nothing was sent. Mint a new link instead.');
        }

        // Read before deliver() stamps `sent_at`, or every send reads as a
        // resend.
        $again = $invite->wasSent() ? ' again' : '';

        if (! $this->deliver($invite, $validated['email'], $request->user('admin'))) {
            return back()->with('status', "{$validated['email']} has unsubscribed, so nothing was sent.");
        }

        return back()->with('status', "Invite sent{$again} to {$validated['email']}.");
    }

    /**
     * Queue the email and record that we did.
     *
     * Routed rather than notified through a User: an invite is outreach, and
     * the address almost never has an account behind it yet.
     *
     * `sent_at` is written even though delivery is asynchronous, and that is
     * the honest reading of it — what the admin needs to know is whether this
     * link has been put in front of that address, and nothing downstream of
     * the queue reports back. A mail host that is refusing connections is a
     * problem the failed-job log shows and this column cannot.
     *
     * Returns false, and writes nothing at all, when the address has
     * unsubscribed.
     */
    private function deliver(Invite $invite, string $email, ?Admin $admin): bool
    {
        // The one thing that stops a send. Someone who unsubscribed said so
        // about their address, not about one link, so a fresh invite to the
        // same address is the same intrusion — and the whole point of keeping
        // our own list is that it is checked here rather than remembered.
        if (EmailSuppression::suppresses($email)) {
            return false;
        }

        Notification::route('mail', $email)->notify(new InviteOffer($invite, $email));

        $invite->forceFill(['email' => $email, 'sent_at' => now()])->save();

        activity()
            ->causedBy($admin)
            ->performedOn($invite)
            ->withProperties(['email' => $email, 'plan' => $invite->plan?->slug])
            ->log('sent invite');

        return true;
    }

    public function revoke(Request $request, Invite $invite): RedirectResponse
    {
        if (! $invite->isRedeemable()) {
            return back()->with('status', 'That invite is already closed — nothing changed.');
        }

        $invite->forceFill(['expires_at' => now()])->save();

        activity()
            ->causedBy($request->user('admin'))
            ->performedOn($invite)
            ->log('revoked invite');

        return back()->with('status', 'Invite closed. The link no longer redeems; anyone who already used it keeps their plan.');
    }
}
