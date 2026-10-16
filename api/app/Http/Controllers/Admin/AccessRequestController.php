<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\User;
use App\Models\WaitlistEntry;
use App\Notifications\ProAccessGranted;
use App\Services\EmailMarkdown;
use App\Services\PlanTerm;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;
use Spatie\Activitylog\Models\Activity;

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
 *
 * Every grant is for a fixed term. It used to be open-ended while the email
 * said "3 months on us", which meant the term existed only in that sentence
 * and ending one depended on an admin remembering to click Revoke months
 * later. The admin now picks the length, it is written to
 * `users.plan_expires_at`, and plans:expire moves the account back to Free on
 * the hour it runs out — the same machinery an invite trial already used.
 * Revoke is still there for ending one early.
 */
class AccessRequestController extends Controller
{
    /**
     * Where a revoked account lands. Not "whatever plan id 1 happens to be":
     * a silent fallback to the wrong row here would either strand somebody on
     * a paid plan or downgrade them further than intended.
     */
    private const FREE_PLAN_SLUG = 'free';

    /**
     * The status filter for pending requests nobody has emailed yet. Not a
     * stored status: "pending" covers both "untouched" and "sent the prices,
     * waiting on them", and only the email log can tell those apart.
     */
    private const NEEDS_ACTION = 'needs-action';

    /**
     * How long a grant can run for, as the approve dropdown offers it.
     *
     * Weeks and months are kept apart rather than flattened into a day count
     * so the dates land where the label says they do: "3 months" granted on
     * the 20th ends on the 20th, not 90 days later on the 19th. The label is
     * also the exact phrase the email uses, so what the admin picked and what
     * the user is told are the same string and cannot drift.
     *
     * There is deliberately no open-ended option. That was the old behaviour
     * and the whole reason nothing ever expired; anything that genuinely needs
     * to run forever is a plan change on the account, not a request grant.
     *
     * @var array<string, array{label: string, weeks: int, months: int}>
     */
    public const TERMS = [
        '1-week' => ['label' => '1 week', 'weeks' => 1, 'months' => 0],
        '2-weeks' => ['label' => '2 weeks', 'weeks' => 2, 'months' => 0],
        '1-month' => ['label' => '1 month', 'weeks' => 0, 'months' => 1],
        '2-months' => ['label' => '2 months', 'weeks' => 0, 'months' => 2],
        '3-months' => ['label' => '3 months', 'weeks' => 0, 'months' => 3],
        '6-months' => ['label' => '6 months', 'weeks' => 0, 'months' => 6],
        '12-months' => ['label' => '12 months', 'weeks' => 0, 'months' => 12],
    ];

    /**
     * What Pro costs, per term, as the payment email quotes it.
     *
     * Only the monthly price is public (PRO_PRICE_USD on the client); the
     * longer terms are offered by email, so this is the one place they live.
     * Keyed by the same values as TERMS so a paid grant and the price quoted
     * for it can be read off one row.
     *
     * @var array<string, int>
     */
    public const PRICES_USD = [
        '1-month' => 20,
        '3-months' => 52,
        '6-months' => 96,
        '12-months' => 160,
    ];

    /**
     * The plan the payment email sells. PRICES_USD is a Pro price list, so
     * the email is only offered on a request for this plan — a Custom
     * enquiry quoted $20 a month is answering a question nobody asked.
     */
    public const PRICED_PLAN_SLUG = 'pro';

    public function index(Request $request): View
    {
        $search = trim((string) $request->query('search', ''));
        $plan = trim((string) $request->query('plan', ''));

        // Defaults to the queue, not the archive. Once entries can be settled,
        // showing every decided row by default buries the handful that still
        // need a person. `all` is the escape hatch for looking things up.
        $status = (string) $request->query('status', WaitlistEntry::STATUS_PENDING);

        if (! in_array($status, [...WaitlistEntry::STATUSES, self::NEEDS_ACTION, 'all'], true)) {
            $status = WaitlistEntry::STATUS_PENDING;
        }

        // Always worked out, not only under its filter: the Pending stat
        // carries the count, so the page says there is work before anyone
        // thinks to filter for it.
        $uncontacted = $this->uncontactedIds(WaitlistEntry::pending()->get(['id', 'email', 'created_at']));

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
            ->when($status === self::NEEDS_ACTION, fn (Builder $query) => $query->whereKey($uncontacted))
            ->when(! in_array($status, ['all', self::NEEDS_ACTION], true), fn (Builder $query) => $query->where('status', $status))
            ->latest()
            ->paginate(25)
            ->withQueryString();

        return view('admin.requests', [
            'entries' => $entries,
            'lastEmailed' => $this->lastEmailed($entries->getCollection()),
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
            'notEmailedEntries' => count($uncontacted),
            'recentEntries' => WaitlistEntry::where('created_at', '>=', now()->subDays(7))->count(),
            'uniqueEmails' => WaitlistEntry::distinct('email')->count('email'),
            // Requests from a real account, which are the only ones that can
            // actually be granted — a Custom enquiry from a stranger cannot.
            'fromAccounts' => WaitlistEntry::whereNotNull('user_id')->count(),
            // The approve dropdown. Passed rather than read off the class in
            // the view so the template has no reason to know the controller.
            'terms' => array_map(fn (array $term) => $term['label'], self::TERMS),
            'pricedPlan' => self::PRICED_PLAN_SLUG,
            'emptyMessage' => $this->emptyMessage($search, $plan, $status),
        ]);
    }

    /**
     * Grant the plan the request asked for.
     *
     * The pending-status claim is what stops a second approve: two admins
     * with the page open is the realistic race, and the loser must not grant
     * or email twice. See grant() for how the term is written.
     */
    public function approve(Request $request, WaitlistEntry $entry): RedirectResponse
    {
        return $this->grant($request, $entry, renewing: false);
    }

    /**
     * Add a term to a request that is already approved.
     *
     * The payment email offers a free week first, so the usual paid grant
     * lands on a request that was approved for the trial — and approve() only
     * takes pending ones. Without this the only route was Revoke then Approve,
     * which drops a paying customer to Free in between (UserObserver's
     * container fan-out included) just to change a date. Renewals are the
     * same case, months later.
     *
     * An approved row stays approved, so the status cannot stop a double
     * submit the way it does for approve(). The form carries the end date the
     * admin was looking at (`seen_until`) instead, and a renewal whose account
     * has moved on since — the first click of a double-click, a revoke, a
     * second admin — is refused rather than stacked on top.
     */
    public function renew(Request $request, WaitlistEntry $entry): RedirectResponse
    {
        return $this->grant($request, $entry, renewing: true);
    }

    /**
     * The shared body of approve() and renew().
     *
     * Everything that decides the grant happens in one transaction: lock the
     * request and the account, check both are still what the admin saw, stamp
     * the decision, and write the plan and its end date together. Writing them
     * separately left an account on Free with a future end date (and the
     * request approved) whenever the second write failed. UserObserver's
     * container fan-out — a telnet connection per running station — waits for
     * the commit, so the row lock is never held across network I/O; only the
     * email is sent outside.
     *
     * The account's row lock is also what orders this against plans:expire,
     * which re-reads and locks the same row before demoting it, so a renewal
     * of a lapsed trial cannot be overwritten by an expiry that read it first.
     *
     * The term is EXTENDED from a running grant of the same plan, not
     * restarted — see PlanTerm::extendsFrom() and termStart().
     */
    private function grant(Request $request, WaitlistEntry $entry, bool $renewing): RedirectResponse
    {
        $choice = $this->grantChoice($request);

        if (is_string($choice)) {
            return back()->with('status', $choice);
        }

        [$term, $paid] = $choice;

        if ($entry->user_id === null) {
            // Not a permission failure — there is genuinely nobody to upgrade.
            return back()->with('status', "{$entry->email} has no GoCast account, so there is nothing to grant. Reply by email and dismiss the request.");
        }

        $plan = Plan::where('slug', $entry->plan)->first();

        if (! $plan) {
            return back()->with('status', "No plan is configured with the slug \"{$entry->plan}\", so this request cannot be granted.");
        }

        $outcome = DB::transaction(function () use ($request, $entry, $plan, $term, $renewing) {
            $locked = WaitlistEntry::whereKey($entry->getKey())->lockForUpdate()->first();

            $claimable = $renewing
                ? $locked?->status === WaitlistEntry::STATUS_APPROVED
                : $locked?->isGrantable();

            if (! $claimable) {
                return $renewing
                    ? 'Only an approved request can be renewed, and this one is not (any more) — nothing changed. Reload the page.'
                    : 'That request was already settled — nothing changed.';
            }

            // User is soft-deleted and the foreign key survives a closed
            // account, so `user_id` being set is not the same as there being
            // an account to move. The default scope leaves a closed one out.
            $user = User::whereKey($entry->user_id)->lockForUpdate()->first();

            if (! $user) {
                return "The account behind {$entry->email} has been deleted, so there is nothing to grant.";
            }

            if ($renewing && (string) $request->input('seen_until') !== (string) $user->plan_expires_at?->getTimestamp()) {
                return "{$entry->email}'s end date has changed since this page loaded, so nothing was added. Reload and check it before renewing.";
            }

            $start = $this->termStart($user, $plan);

            if (is_string($start)) {
                return $start;
            }

            // Stamped on a renewal too, so the row says who made the latest
            // grant, which is the one anybody asking "who put them on this"
            // means.
            $locked->markReviewed(WaitlistEntry::STATUS_APPROVED, $request->user('admin'));

            $endsAt = PlanTerm::endOfTerm($start, $term);

            // An extension of the plan they are already on changes no plan_id,
            // so the common renewal triggers no fan-out at all.
            $user->forceFill(['plan_id' => $plan->id, 'plan_expires_at' => $endsAt])->save();

            return [$user, $endsAt, $start !== null];
        });

        if (is_string($outcome)) {
            return back()->with('status', $outcome);
        }

        [$user, $endsAt, $extended] = $outcome;

        // A renewal that is not an extension is a lapsed grant coming back,
        // and "your request is approved" would be news of a decision made
        // weeks ago.
        $user->notify(new ProAccessGranted($plan, $endsAt, $term['label'], paid: $paid, extended: $extended, renewed: $renewing && ! $extended));

        $kind = $paid ? 'paid' : 'free';
        $how = $extended ? "Added {$term['label']} to" : "Granted {$term['label']} of";

        return back()->with('status', "{$how} {$plan->name} ({$kind}) for {$user->email}, now until {$endsAt->toFormattedDateString()}, and emailed them. It returns to Free on its own; their dashboard catches up on their next page load.");
    }

    /**
     * Where a new term starts for this account: the end of its running grant
     * of the same plan, null for today, or the refusal to flash.
     *
     * Refuses whatever PlanTerm::conflict() names. Both cases are a decision
     * about the account, not this request, so neither is guessed at here; the
     * stations upgrade is where an admin makes that call on purpose.
     */
    private function termStart(User $user, Plan $plan): Carbon|string|null
    {
        $conflict = PlanTerm::conflict($user, $plan, withTerm: true);

        if ($conflict !== null) {
            return "{$conflict} Nothing changed — change the account by hand from Stations if that is what you want.";
        }

        return PlanTerm::extendsFrom($user, $plan);
    }

    /**
     * Open the email composer with the payment email already written.
     *
     * There is no checkout: a request is answered with this email, they reply
     * with the term they want, and the admin grants it once the money is in.
     * So this is the first step for every Pro request, and Approve is the last
     * one. Pre-filled rather than sent, because the admin is the one who knows
     * whether this person was quoted the founding price, and the composer's
     * preview step is where that gets edited in.
     *
     * Offered on approved rows as well as pending ones: the trial the email
     * offers is an approval, and somebody on it still needs the prices. Not
     * on a dismissed one — prices to somebody already turned down — nor one
     * with no account, which could pay and still never be granted. The view
     * hides the button in both cases; this is the same rule for a direct GET.
     *
     * Leaves the request as it is — nothing has been decided by sending it.
     */
    public function paymentEmail(WaitlistEntry $entry): RedirectResponse
    {
        if ($entry->plan !== self::PRICED_PLAN_SLUG) {
            return back()->with('status', 'The payment email quotes Pro prices, and this is a request for something else. Reply to it by email.');
        }

        if ($entry->status === WaitlistEntry::STATUS_REJECTED) {
            return back()->with('status', 'That request was dismissed. Reopen it first if they should get the prices after all.');
        }

        if ($entry->user === null) {
            return back()->with('status', "{$entry->email} has no GoCast account, so a payment could not be granted to anything. Reply by email.");
        }

        $user = $entry->user;
        $station = $user?->stations()->first();

        $prices = collect(self::PRICES_USD)
            ->map(fn (int $price, string $key) => '| '.self::TERMS[$key]['label']." | \${$price} |")
            ->implode("\n");

        // Escaped because both are typed by the user and land in Markdown sent
        // from our address: a `|` in a station name breaks the price table,
        // and `[x](url)` would put their link in our email.
        $for = $station ? ' for **'.EmailMarkdown::escape($station->name).'**' : '';
        $monthly = self::PRICES_USD['1-month'];

        $body = <<<MD
            Thanks for asking about GoCast Pro{$for}.

            Pro is \${$monthly} a month, and a longer term costs less:

            | Term | Price |
            |---|---|
            {$prices}

            Card payments are coming. For now we take payment in USDT. Reply with the term you want and we'll send you the payment details. Pro is switched on as soon as the payment arrives.

            Want to try it first? Reply and we'll turn on 7 days of Pro, free.

            You can cancel anytime. We refund what you paid minus the months you have used, counted at the monthly price. If those months come to more than you paid, there is no refund, and you never owe anything extra.
            MD;

        return redirect()->route('admin.emails.index')->withInput([
            'recipients' => $entry->email,
            'subject' => 'GoCast Pro: how to pay',
            // Not escaped: the greeting is printed as plain text by the email
            // template, so backslashes would show. Only the body is Markdown.
            // Left blank rather than invalid when the name is too long for
            // the composer's 120-character greeting.
            'greeting' => $user?->name && mb_strlen("Hey {$user->name},") <= 120 ? "Hey {$user->name}," : '',
            'body' => $body,
        ]);
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
     *
     * Only takes back the plan this request granted. An account moved onto
     * something else by hand since — a Custom deal — is refused, for the same
     * reason grant() will not overwrite one.
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

        // The plan write is in the transaction for the same reason as
        // grant(): reopened-but-still-Pro is the half-done state to avoid.
        // UserObserver's fan-out still waits for the commit.
        $reopened = DB::transaction(function () use ($entry, $free) {
            $locked = WaitlistEntry::whereKey($entry->getKey())->lockForUpdate()->first();

            if ($locked?->status !== WaitlistEntry::STATUS_APPROVED) {
                return 'That request was already settled — nothing changed.';
            }

            $user = User::whereKey($locked->user_id)->lockForUpdate()->first();
            $granted = Plan::where('slug', $locked->plan)->value('id');

            // On Free already (it expired) is fine: reopening is all that is
            // left to do. Any plan other than the granted one is not ours.
            if ($user && $user->plan_id !== $free->id && $user->plan_id !== $granted) {
                $current = Plan::find($user->plan_id)?->name ?? 'another plan';

                return "{$user->email} is on {$current} now, which this request did not grant. Nothing changed — change the account by hand if it should go back to Free.";
            }

            $locked->reopen();

            $user?->forceFill(['plan_id' => $free->id, 'plan_expires_at' => null])->save();

            return $locked;
        });

        if (is_string($reopened)) {
            return back()->with('status', $reopened);
        }

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
     * The term and the paid flag from an approve or renew form, or the
     * refusal to flash.
     *
     * Both are required. They used to default — to 3 months, then to a free
     * week — and either default is wrong for somebody: a paying customer left
     * on "Free, 1 week" is emailed "free of charge" and dropped after seven
     * days. The form makes the admin pick both; a post without them is a
     * stale form and is refused rather than guessed at.
     *
     * A paid grant must be a term that has a price. Every other term is a
     * trial or a gift, so "paid, 1 week" is the admin having forgotten to
     * change the term, not a sale.
     *
     * @return array{0: array{label: string, weeks: int, months: int}, 1: bool}|string
     */
    private function grantChoice(Request $request): array|string
    {
        $term = self::TERMS[(string) $request->input('term')] ?? null;

        if ($term === null) {
            // Flashed like every other refusal here because the admin layout
            // renders `status` and not the error bag.
            return 'That is not a term we grant. Reload the page and pick one from the list.';
        }

        $paid = $request->input('paid');

        if (! in_array($paid, ['0', '1'], true)) {
            return 'Pick whether this was paid or free before granting it.';
        }

        if ($paid === '1' && ! array_key_exists((string) $request->input('term'), self::PRICES_USD)) {
            return "{$term['label']} is not a term we sell, so it cannot be a paid grant. Pick the term they paid for.";
        }

        return [$term, $paid === '1'];
    }

    /**
     * The default status filter hides rows, so "nothing here" is ambiguous in
     * a way it was not when the page showed everything. Spelling out which
     * emptiness this is saves a reviewer wondering whether the queue is clear
     * or the table is.
     */
    /**
     * The latest admin email to each request's address since it came in,
     * keyed by entry id. Entries nobody has emailed are absent.
     *
     * Read off the "sent email" activity rather than a column on the entry,
     * so every request emailed before this existed shows up as contacted too.
     * Only mail sent from the admin composer is logged; a reply from the
     * mailbox itself does not count. Marketing sends are skipped: a newsletter
     * to everyone is not an answer to anybody's request.
     *
     * @param  Collection<int, WaitlistEntry>  $entries
     * @return array<int, array{at: Carbon, subject: string}>
     */
    private function lastEmailed(Collection $entries): array
    {
        if ($entries->isEmpty()) {
            return [];
        }

        $wanted = $entries->map(fn (WaitlistEntry $entry) => mb_strtolower($entry->email))->flip();
        $sends = [];

        Activity::query()
            ->where('description', 'sent email')
            ->where('created_at', '>=', $entries->min('created_at'))
            ->oldest()
            ->get(['properties', 'created_at'])
            ->each(function (Activity $send) use ($wanted, &$sends) {
                if ($send->properties['marketing'] ?? false) {
                    return;
                }

                foreach ((array) ($send->properties['sent'] ?? []) as $address) {
                    $address = mb_strtolower((string) $address);

                    if ($wanted->has($address)) {
                        $sends[$address][] = ['at' => $send->created_at, 'subject' => (string) ($send->properties['subject'] ?? '')];
                    }
                }
            });

        $latest = [];

        foreach ($entries as $entry) {
            // Oldest first, so the last one at or after the request wins.
            foreach ($sends[mb_strtolower($entry->email)] ?? [] as $send) {
                if ($send['at']->gte($entry->created_at)) {
                    $latest[$entry->id] = $send;
                }
            }
        }

        return $latest;
    }

    /**
     * @param  Collection<int, WaitlistEntry>  $pending
     * @return list<int>
     */
    private function uncontactedIds(Collection $pending): array
    {
        $emailed = $this->lastEmailed($pending);

        return $pending->reject(fn (WaitlistEntry $entry) => isset($emailed[$entry->id]))
            ->pluck('id')
            ->values()
            ->all();
    }

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
            self::NEEDS_ACTION => 'Every pending request has been emailed.',
            WaitlistEntry::STATUS_APPROVED => 'Nothing has been approved yet.',
            WaitlistEntry::STATUS_REJECTED => 'Nothing has been dismissed.',
            default => 'No access requests yet.',
        };
    }
}
