<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\WaitlistEntry;
use App\Notifications\ProAccessGranted;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

/**
 * The review queue for "Request access" submissions, and the actions that
 * settle one.
 *
 * Approving is the only action here with an effect outside this table, and it
 * is a big one: there is no checkout anywhere in the app, so this controller
 * is the ONLY way an account reaches a paid plan. Everything downstream reads
 * the plan at request time — AutoDJ gating and the listener cap are what
 * actually differ today — so the grant itself is a single column write and
 * nothing here needs to touch a station. UserObserver additionally pushes the
 * watermark flag into running containers, which costs nothing but changes
 * nothing either while no clips are installed.
 */
class AccessRequestController extends Controller
{
    /**
     * Where a revoked account lands. Not "whatever plan id 1 happens to be":
     * a silent fallback to the wrong row here would either strand somebody on
     * a paid plan or downgrade them further than intended.
     */
    private const FREE_PLAN_SLUG = 'free';

    public function index(Request $request): View
    {
        $search = trim((string) $request->query('search', ''));
        $plan = trim((string) $request->query('plan', ''));

        // Defaults to the queue, not the archive. Once entries can be settled,
        // showing every decided row by default buries the handful that still
        // need a person. `all` is the escape hatch for looking things up.
        $status = (string) $request->query('status', WaitlistEntry::STATUS_PENDING);

        if (! in_array($status, [...WaitlistEntry::STATUSES, 'all'], true)) {
            $status = WaitlistEntry::STATUS_PENDING;
        }

        $entries = WaitlistEntry::query()
            // Pro requests carry the account that sent them, and the whole
            // reason for reviewing one is to look at their stations. Eager
            // loaded because the table renders both on every row.
            // `user.plan` is here because the row shows what the account is on
            // TODAY next to what it asked for — the fastest way to spot a
            // request that has already been granted by hand.
            ->with([
                'user' => fn ($query) => $query->withCount('stations')->with('plan:id,name'),
                'reviewer:id,name',
            ])
            ->when($search !== '', fn (Builder $query) => $query->where(
                fn (Builder $group) => $group
                    ->where('email', 'like', "%{$search}%")
                    ->orWhere('social', 'like', "%{$search}%")
                    ->orWhere('message', 'like', "%{$search}%")
            ))
            ->when($plan !== '', fn (Builder $query) => $query->where('plan', $plan))
            ->when($status !== 'all', fn (Builder $query) => $query->where('status', $status))
            ->latest()
            ->paginate(25)
            ->withQueryString();

        return view('admin.requests', [
            'entries' => $entries,
            'search' => $search,
            'plan' => $plan,
            'status' => $status,
            // Built from the data rather than a constant: `plan` is stored
            // verbatim from whichever surface sent the form, so the filter has
            // to follow whatever has actually been submitted.
            'plans' => WaitlistEntry::query()->distinct()->orderBy('plan')->pluck('plan'),
            // Which of those name a real plan row. A request for a plan that
            // does not exist can never be granted, and the row should say so
            // before someone clicks rather than after.
            'grantablePlans' => Plan::query()->pluck('slug')->all(),
            'totalEntries' => WaitlistEntry::count(),
            'pendingEntries' => WaitlistEntry::pending()->count(),
            'recentEntries' => WaitlistEntry::where('created_at', '>=', now()->subDays(7))->count(),
            'uniqueEmails' => WaitlistEntry::distinct('email')->count('email'),
            // Requests from a real account, which are the only ones that can
            // actually be granted — a Custom enquiry from a stranger cannot.
            'fromAccounts' => WaitlistEntry::whereNotNull('user_id')->count(),
            'emptyMessage' => $this->emptyMessage($search, $plan, $status),
        ]);
    }

    /**
     * Grant the plan the request asked for.
     *
     * Split deliberately across the transaction boundary. Inside it, the only
     * thing that happens is CLAIMING the request — lock the row, check it is
     * still pending, stamp the decision. The plan write and the email happen
     * after the commit, because UserObserver answers a plan change by opening
     * a telnet connection to every running container (3s timeout each), and
     * holding a row lock open across network I/O to Docker is how an admin
     * panel starts timing out under two people using it.
     *
     * The cost of that split is a narrow window where the entry reads
     * `approved` and the account is still free. It needs the database to fail
     * between two adjacent statements, and the fix is to revoke and approve
     * again — which is strictly better than the alternative failure, where a
     * paid plan is granted and nothing records who did it.
     */
    public function approve(Request $request, WaitlistEntry $entry): RedirectResponse
    {
        if ($entry->user_id === null) {
            // Not a permission failure — there is genuinely nobody to upgrade.
            return back()->with('status', "{$entry->email} has no GoCast account, so there is nothing to grant. Reply by email and dismiss the request.");
        }

        // Resolved before the claim rather than after it, because User is
        // soft-deleted: the foreign key survives a closed account (the column
        // is only nulled by a hard delete), so `user_id` being set is not the
        // same as there being an account to move. Approving one of these would
        // otherwise stamp the decision and then fatal on the plan write.
        $user = $entry->user;

        if (! $user) {
            return back()->with('status', "The account behind {$entry->email} has been deleted. Dismiss the request instead.");
        }

        $plan = Plan::where('slug', $entry->plan)->first();

        if (! $plan) {
            return back()->with('status', "No plan is configured with the slug \"{$entry->plan}\", so this request cannot be granted.");
        }

        $claimed = DB::transaction(function () use ($entry, $request) {
            $locked = WaitlistEntry::whereKey($entry->getKey())->lockForUpdate()->first();

            // Two admins with the page open is the realistic race, and the
            // loser must not re-stamp the decision with their own name.
            if (! $locked?->isGrantable()) {
                return null;
            }

            $locked->markReviewed(WaitlistEntry::STATUS_APPROVED, $request->user('admin'));

            return $locked;
        });

        if (! $claimed) {
            return back()->with('status', 'That request was already settled — nothing changed.');
        }

        $user->update(['plan_id' => $plan->id]);
        $user->notify(new ProAccessGranted($plan));

        return back()->with('status', "{$user->email} is on {$plan->name} and has been emailed. Their dashboard catches up on their next page load.");
    }

    /**
     * Decline, or — for a Custom enquiry — record that it was handled by email.
     * Pure bookkeeping: nothing outside this table changes.
     */
    public function dismiss(Request $request, WaitlistEntry $entry): RedirectResponse
    {
        if ($entry->status === WaitlistEntry::STATUS_APPROVED) {
            return back()->with('status', 'That request was approved. Revoke it instead if you want to take the plan back.');
        }

        $entry->markReviewed(WaitlistEntry::STATUS_REJECTED, $request->user('admin'));

        return back()->with('status', "Dismissed {$entry->email}. Nothing was sent to them.");
    }

    /**
     * Take the plan back and put the request back in the queue.
     *
     * Returns to `pending`, not `rejected`: revoking is normally undoing a
     * mistake or ending a trial, which leaves the original question open
     * again rather than answered with a no.
     *
     * What this does NOT do is enforce the free limits retroactively. The caps
     * are checked when a station is created and when one is started, never on
     * the way down, so a downgraded account keeps the station it has and the
     * tracks in it. Deleting somebody's work on a downgrade would be a far
     * worse default than letting them sit over a line.
     */
    public function revoke(WaitlistEntry $entry): RedirectResponse
    {
        if ($entry->status !== WaitlistEntry::STATUS_APPROVED) {
            return back()->with('status', 'That request is not approved, so there is nothing to revoke.');
        }

        $free = Plan::where('slug', self::FREE_PLAN_SLUG)->first();

        if (! $free) {
            return back()->with('status', 'No plan with the slug "'.self::FREE_PLAN_SLUG.'" exists, so there is nowhere to move this account back to.');
        }

        $reopened = DB::transaction(function () use ($entry) {
            $locked = WaitlistEntry::whereKey($entry->getKey())->lockForUpdate()->first();

            if ($locked?->status !== WaitlistEntry::STATUS_APPROVED) {
                return null;
            }

            $locked->reopen();

            return $locked;
        });

        if (! $reopened) {
            return back()->with('status', 'That request was already settled — nothing changed.');
        }

        // Same split as approve(), for the same reason: this is the telnet
        // fan-out that puts the watermark back, and on a Pro account it can be
        // five containers rather than one.
        $reopened->user?->update(['plan_id' => $free->id]);

        return back()->with('status', "Moved {$reopened->email} back to {$free->name}. Their station keeps running.");
    }

    /**
     * Undo a dismissal. Kept separate from revoke() because it touches nothing
     * but this table — a rejected request never granted anything.
     */
    public function reopen(WaitlistEntry $entry): RedirectResponse
    {
        if ($entry->status !== WaitlistEntry::STATUS_REJECTED) {
            return back()->with('status', 'Only a dismissed request can be reopened.');
        }

        $entry->reopen();

        return back()->with('status', "Reopened {$entry->email}.");
    }

    /**
     * The default status filter hides rows, so "nothing here" is ambiguous in
     * a way it was not when the page showed everything. Spelling out which
     * emptiness this is saves a reviewer wondering whether the queue is clear
     * or the table is.
     */
    private function emptyMessage(string $search, string $plan, string $status): string
    {
        if ($search !== '' || $plan !== '') {
            return 'No requests match that filter.';
        }

        if (WaitlistEntry::count() === 0) {
            return 'No access requests yet.';
        }

        return match ($status) {
            WaitlistEntry::STATUS_PENDING => 'Nothing waiting for review.',
            WaitlistEntry::STATUS_APPROVED => 'Nothing has been approved yet.',
            WaitlistEntry::STATUS_REJECTED => 'Nothing has been dismissed.',
            default => 'No access requests yet.',
        };
    }
}
