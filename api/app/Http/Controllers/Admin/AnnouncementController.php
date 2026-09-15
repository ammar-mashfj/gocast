<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreAnnouncementRequest;
use App\Models\User;
use App\Notifications\Bell\BellPayload;
use App\Notifications\ProductUpdate;
use App\Services\AnnouncementInProgressException;
use App\Services\AnnouncementSender;
use Illuminate\Http\RedirectResponse;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\View\View;
use InvalidArgumentException;
use stdClass;

/**
 * Writes one message into the dashboard bell of every account.
 *
 * TWO STEPS, AND THE SECOND ONE IS THE POINT. Every other form in this panel
 * does something to one account and can be undone by doing the opposite: an
 * invite is revoked, a plan is downgraded, a station is unfeatured. This one
 * cannot. There is no unsend, the row is in everybody's bell the moment the
 * request returns, and a typo is read by the entire platform. So composing and
 * sending are separate requests with the rendered result in between — the same
 * shape as the console command, which previews and then asks.
 *
 * WHAT THIS PAGE IS NOT is a scheduler or a drafts folder. An announcement is
 * written, read once more, and sent; a draft that sits here for a week is a
 * worse version of the JSON file the command already takes, which can at least
 * be reviewed in a diff.
 *
 * @see AnnouncementSender for the fan-out and the guard that makes sending
 *      twice a no-op.
 */
class AnnouncementController extends Controller
{
    public function index(): View
    {
        return view('admin.announcements', [
            'sent' => $this->history(),
            'accounts' => User::count(),
            'levels' => BellPayload::LEVELS,
        ]);
    }

    /**
     * Step one: show exactly what will land, and in how many bells.
     */
    public function preview(StoreAnnouncementRequest $request, AnnouncementSender $sender): View|RedirectResponse
    {
        $fields = $request->validated();

        try {
            $update = ProductUpdate::fromArray($fields);
        } catch (InvalidArgumentException $e) {
            // The form request's rules mirror BellPayload's, so this is the
            // combination neither of them anticipated rather than the ordinary
            // invalid input. Better back on the form with the message than a
            // 500 on the one page where a stack trace tells the admin nothing.
            return back()->withInput()->withErrors(['headline' => $e->getMessage()]);
        }

        $planned = $sender->plan($update);

        return view('admin.announcement-preview', [
            // Rendered from the payload rather than from the form fields, so
            // what is on screen is what will be stored — defaults included.
            // A preview built from the input would agree with the form and
            // disagree with the product.
            'payload' => $update->toDatabase(new stdClass),
            'key' => $update->key,
            // Carried through as hidden inputs so the send posts the thing
            // that was previewed, not a fresh interpretation of it.
            'fields' => $fields,
            'audience' => $planned['audience'],
            'pending' => $planned['pending'],
            'skipped' => $planned['skipped'],
        ]);
    }

    /**
     * Step two: send it.
     */
    public function store(StoreAnnouncementRequest $request, AnnouncementSender $sender): RedirectResponse
    {
        try {
            $update = ProductUpdate::fromArray($request->validated());
        } catch (InvalidArgumentException $e) {
            return back()->withInput()->withErrors(['headline' => $e->getMessage()]);
        }

        // The fan-out is one insert per account, inline, and PHP's default
        // execution limit is the wrong ceiling for it: hitting that mid-send
        // leaves a partial, unrecallable announcement AND a fatal that unwinds
        // nothing. The web server and any proxy in front of it still have
        // their own timeouts, which is why the command exists for an audience
        // large enough to worry about.
        set_time_limit(0);

        // Same reason as InviteController: LogsActivity resolves its causer off
        // the default guard, which is never the admin guard. Without this, the
        // one irreversible action in the panel is the one with no record of who
        // took it.
        //
        // WRITTEN BEFORE THE SEND, then filled in after. Logging it afterwards
        // reads better and is wrong in exactly the case the log is for: a
        // fan-out that dies halfway — a timeout, a killed worker — has already
        // written rows nobody can recall, and an entry that only exists on the
        // success path leaves that with no record of who started it. The
        // counts are the part that has to wait; the causer and the key do not.
        $entry = activity()
            ->causedBy($request->user('admin'))
            ->withProperties(['announcement' => $update->key])
            ->log('sent announcement');

        try {
            $result = $sender->send($update);
        } catch (AnnouncementInProgressException $e) {
            // Another send of this key is in flight — most often this admin's
            // own second click on a button whose first request has not come
            // back yet. Nothing was written, so the entry above is retitled
            // rather than left claiming a send that did not happen.
            $entry->forceFill(['description' => 'announcement send refused, already running'])->save();

            return redirect()->route('admin.announcements.index')->with('status', $e->getMessage());
        }

        $entry->forceFill([
            'properties' => [
                'announcement' => $update->key,
                'sent' => $result['sent'],
                'skipped' => $result['skipped'],
            ],
        ])->save();

        // A send that reached nobody is reported as such rather than as a
        // success, because the two look identical from here and the cause is
        // almost always a key that has been used before — a second click on
        // the send button, or the same headline sent twice in one month.
        $status = $result['sent'] === 0
            ? "Nothing sent — every account already has [{$update->key}]."
            : "Sent to {$result['sent']} ".($result['sent'] === 1 ? 'account' : 'accounts')
                .($result['skipped'] > 0 ? ", skipped {$result['skipped']} who already had it." : '.');

        return redirect()->route('admin.announcements.index')->with('status', $status);
    }

    /**
     * Announcements already sent, newest first.
     *
     * Grouped by the stored payload, which works because an announcement says
     * the same thing to everybody — ProductUpdate reads nothing off the
     * notifiable, so every recipient's row is byte-identical and one group is
     * one announcement. Grouping by the key instead would mean extracting it
     * from a text column in SQL, which is the same scan with worse reading.
     *
     * The grouping is exact despite `data` being TEXT: `max_sort_length`
     * truncates SORTING, not the comparison GROUP BY does, so two long
     * announcements agreeing for their first kilobyte still land in separate
     * groups. There is a test for exactly that, because the reading that says
     * otherwise is an easy one to arrive at.
     *
     * Capped at twenty and not paginated: this is a record of what was said,
     * consulted to check whether something has already gone out, and anybody
     * looking further back than twenty announcements wants the activity log.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function history(): Collection
    {
        return DatabaseNotification::query()
            ->where('type', ProductUpdate::class)
            ->selectRaw('data, count(*) as recipients, max(created_at) as last_sent')
            ->groupBy('data')
            ->orderByDesc('last_sent')
            ->limit(20)
            ->get()
            ->map(fn (DatabaseNotification $row) => [
                'key' => $row->data['meta']['announcement'] ?? null,
                'title' => $row->data['title'] ?? '',
                'level' => $row->data['level'] ?? BellPayload::LEVEL_INFO,
                'recipients' => (int) $row->recipients,
                // Parsed rather than left as the raw aggregate string: the
                // column is not on the model, so nothing casts it and the view
                // would be formatting a string.
                'last_sent' => Carbon::parse($row->last_sent),
            ]);
    }
}
