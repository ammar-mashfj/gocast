<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Notifications\Bell\BellPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Validation\Rule;

/**
 * The dashboard bell: the signed-in user's own notifications.
 *
 * EVERY READ AND WRITE IS SCOPED THROUGH `$request->user()->notifications()`.
 * Not one of these methods resolves a notification by id alone, and none uses
 * implicit route-model binding, because `notifications` is a single table
 * shared by every account and the ids in it are the only thing separating one
 * user's feed from another's. Binding `{notification}` in the route signature
 * would hand any authenticated user any row they could name — and since the
 * id travels to the browser in the feed, naming one is not hard. Scoping first
 * turns that into a 404.
 *
 * The bell polls {@see self::unreadCount()} and nothing else while it is shut,
 * which is why that method exists rather than the client reading a count off
 * the feed: the count is one indexed aggregate, the feed is rows and JSON.
 */
class NotificationController extends Controller
{
    /**
     * The feed's sort, and therefore exactly the parameters its cursor carries.
     *
     * One list rather than two because {@see self::cursorFrom()} has to reject
     * a cursor that is missing any of them, and a sort column added here
     * without the check knowing about it is the case that 500s.
     */
    private const SORT_COLUMNS = ['created_at', 'id'];

    /**
     * The feed, newest first.
     *
     * Cursor-paginated rather than offset-paginated. The feed is ordered by
     * creation and grows at the head, so an offset page 2 fetched after a new
     * notification arrives repeats the last row of page 1 — visibly, since
     * these rows are read one at a time by a human.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        // `nullable` on both, and null read as absent below. Laravel's
        // ConvertEmptyStringsToNull rewrites `?category=` to null, and that is
        // precisely what a filter control emits for its "All" option — without
        // this the unfiltered case answers 422 instead of the whole feed.
        $filters = $request->validate([
            'filter' => ['sometimes', 'nullable', Rule::in(['all', 'unread'])],
            // Validated against the real constant rather than as free text.
            // Both ends of this filter are backend — the list the payloads are
            // built from is the list the feed can be filtered by — so there is
            // nothing to drift, and constraining it here is what lets the
            // clause below be a plain bound literal instead of a LIKE pattern
            // that has to escape whatever a caller sends.
            //
            // The cost is that a category retired from the list stops being
            // filterable while rows still carry it. That is the right answer:
            // the API should not offer a filter it no longer has a name for,
            // and those rows are still in the unfiltered feed.
            'category' => ['sometimes', 'nullable', Rule::in(BellPayload::CATEGORIES)],
        ]);

        $query = $request->user()->notifications();

        if (($filters['filter'] ?? 'all') === 'unread') {
            $query->whereNull('read_at');
        }

        // Filtered in SQL against the JSON payload rather than in PHP after
        // the fact, so a category with few rows doesn't page through hundreds
        // of others to fill a page. `data` is a text column, so this is a
        // LIKE on the serialised JSON rather than a JSON path expression —
        // crude, but the categories are a short closed list of distinct words
        // and this runs on one user's rows.
        //
        // No pattern escaping needed, and that is the validator's doing rather
        // than luck: `category` can only be one of BellPayload::CATEGORIES by
        // the time it reaches here, none of which contain `%`, `_` or a
        // backslash. Widen that rule and this line needs escaping again — and
        // escaping that behaves the same on every driver is not free, since
        // SQLite's LIKE has no default escape character at all.
        if (isset($filters['category'])) {
            $query->where('data', 'like', '%"category":"'.$filters['category'].'"%');
        }

        // SORT_COLUMNS is `created_at` then `id`, and the second one is not
        // decoration. `created_at` DESC alone is not a total order, and this is
        // the one place that matters: the column is a second-precision
        // timestamp and notifications genuinely arrive in the same second — a
        // single request can dispatch two. Cursor pagination needs the sort to
        // be unique or it has no stable place to resume from, so a tie can
        // repeat a row on the next page or skip one entirely. The uuid is not
        // chronological, but it is unique and stable, which is exactly what the
        // cursor needs; it only ever decides between rows the clock could not
        // separate.
        //
        // `reorder()` first because the relation arrives pre-sorted: Laravel's
        // notifications() is morphMany(...)->latest(). Without it the cursor
        // reads `created_at desc, created_at desc, id desc` — harmless, but the
        // sort this comment describes should be the one the query actually has.
        $query->reorder();

        foreach (self::SORT_COLUMNS as $column) {
            $query->orderByDesc($column);
        }

        // The cursor is passed explicitly rather than left to the paginator's
        // request resolver, because a string argument is the only way to hand
        // it one we have already vetted — see cursorFrom().
        $notifications = $query
            ->cursorPaginate(
                (int) config('notifications.per_page', 20),
                ['*'],
                'cursor',
                $this->cursorFrom($request),
            )
            ->withQueryString();

        return NotificationResource::collection($notifications)
            ->additional(['meta' => [
                'unread_count' => $this->countUnread($request),
            ]]);
    }

    /**
     * Just the badge number.
     *
     * The cap is reported alongside the number so the client can render "99+"
     * without hard-coding a ceiling of its own — see config/notifications.php.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $cap = (int) config('notifications.unread_count_cap', 99);

        return response()->json(['data' => [
            'unread_count' => $this->countUnread($request),
            'capped_at' => $cap,
        ]]);
    }

    /**
     * Mark one notification read. Idempotent: marking an already-read
     * notification is a no-op that still answers 200, because the client fires
     * this on click and a double click is not an error.
     *
     * The new count rides along, as it does on every other mutation here. The
     * badge is the reason the client called; making it ask again is a second
     * round trip for a number this request has already counted.
     */
    public function markRead(Request $request, string $notification): NotificationResource
    {
        $row = $this->find($request, $notification);

        if ($row->read_at === null) {
            $row->markAsRead();
        }

        return (new NotificationResource($row))
            ->additional(['meta' => ['unread_count' => $this->countUnread($request)]]);
    }

    /**
     * Mark the whole feed read.
     *
     * Answers with the new count rather than 204, so the badge clears from the
     * response instead of from a second round-trip.
     */
    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(['data' => ['unread_count' => 0]]);
    }

    /**
     * Delete one notification.
     *
     * A real delete, not a hidden flag. The row is a message that has been
     * read and dismissed; keeping it invisible forever would mean the prune
     * command is the only thing that ever frees it, and the user has already
     * said they are done with it.
     */
    public function destroy(Request $request, string $notification): JsonResponse
    {
        $this->find($request, $notification)->delete();

        return response()->json(['data' => [
            'unread_count' => $this->countUnread($request),
        ]]);
    }

    /**
     * Resolve one of THIS user's notifications, or 404.
     *
     * The single place a notification id is turned into a row — see the class
     * docblock for why that matters.
     */
    private function find(Request $request, string $id): DatabaseNotification
    {
        /** @var DatabaseNotification $row */
        $row = $request->user()->notifications()->findOrFail($id);

        return $row;
    }

    /**
     * The request's pagination cursor, or '' for the first page.
     *
     * A CURSOR IS USER INPUT, and the paginator trusts it. `?cursor=` holding
     * base64 of a well-formed JSON object that simply isn't one of ours gets
     * as far as Cursor::fromEncoded(), which reads `_pointsToNextItems` with
     * no guard, and then Cursor::parameter(), which throws when a sort column
     * is missing — either way an uncaught exception and a 500. Only outright
     * garbage is safe today, and only by accident: it fails to decode, and
     * fromEncoded() answers null for that, which is page one.
     *
     * So every cursor gets the same treatment garbage already got. This is not
     * only a hand-edited URL: any client holding a cursor minted before a
     * change to SORT_COLUMNS is carrying one of these, which is precisely when
     * a 500 would be least welcome. Falling back to page one is also what the
     * client can actually do something with — it re-reads the head of a feed
     * whose cursor has gone stale, which is the truthful answer.
     *
     * Returning a string and not a Cursor is deliberate: Laravel decodes a
     * string argument itself, so this vets the cursor without also owning the
     * job of building one, and '' decodes to null, which is page one.
     */
    private function cursorFrom(Request $request): string
    {
        $encoded = $request->query('cursor');

        if (! is_string($encoded) || $encoded === '') {
            return '';
        }

        $decoded = json_decode(base64_decode(strtr($encoded, '-_', '+/')), true);

        if (! is_array($decoded)) {
            return '';
        }

        foreach (['_pointsToNextItems', ...self::SORT_COLUMNS] as $key) {
            if (! array_key_exists($key, $decoded)) {
                return '';
            }
        }

        return $encoded;
    }

    /**
     * The true unread count, uncapped.
     *
     * The cap in config is a RENDERING ceiling, applied by the client, not a
     * limit on this query: `->limit(n)->count()` would emit
     * `select count(*) ... limit n`, which limits the number of aggregate rows
     * returned (one) and not the scan, so it buys nothing while reading as
     * though it does. Counting properly is one index range scan over a single
     * user's rows, which is what the morphs index on `notifiable` is for.
     */
    private function countUnread(Request $request): int
    {
        return $request->user()->unreadNotifications()->count();
    }
}
