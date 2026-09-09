<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreInviteRequest;
use App\Models\Invite;
use App\Models\Plan;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Mints invite links and shows what became of them.
 *
 * The page is a form and a table on purpose: the whole workflow is "make a
 * link, copy it into an email, and later see whether they took it". Anything
 * more (editing a code, reassigning it) would be a second way to do what
 * minting another link already does.
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

        return redirect()
            ->route('admin.invites.index')
            ->with('minted', [
                'id' => $invite->id,
                'url' => $invite->url(),
                'label' => $invite->label,
                'plan' => $invite->plan?->name,
            ]);
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
