<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\ProductUpdate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Cache;

/**
 * Sends one announcement to every account, once.
 *
 * A service rather than the body of the console command, because the command
 * is the first caller and not the last one: an admin page that composes an
 * announcement in a form wants exactly this, and the alternative is a
 * controller that shells out to Artisan or a second copy of the duplicate
 * guard. The command below it is a thin CLI over this method.
 *
 * THE HARD PART IS NOT THE FAN-OUT, IT IS SENDING IT ONCE. A mass notification
 * cannot be recalled: there is no "unsend", and the row is in the bell of
 * every account on the platform. So the failure this class is built around is
 * not a failed send — that one is visible and retryable — but a send that
 * half-succeeded and was retried, which is invisible to the person retrying
 * and obvious to everybody who receives it twice.
 *
 * THE GUARD IS READ-THEN-WRITE, WHICH IS WHY THERE IS A LOCK. `alreadyNotified`
 * takes one snapshot and the fan-out then runs for as long as the account
 * table takes — seconds, and longer on the announcement that matters. Two
 * sends overlapping in that window both see an empty set and both write, which
 * is the one failure this class exists to prevent, arriving through the front
 * door. There is no unique constraint to lean on (`data` is a text column with
 * nothing to index), so the snapshot and the writes it authorises are taken
 * inside a lock named for the announcement.
 *
 * @see ProductUpdate for why that guard is also why the notification is not
 *      queued.
 */
class AnnouncementSender
{
    /**
     * How long the send lock is held.
     *
     * Generous, because it has to outlast a fan-out over every account on a
     * platform that is meant to grow, and the cost of it being too long is a
     * refusal an admin can retry — while the cost of it being too short is the
     * duplicate send it exists to stop. Released as soon as the send returns;
     * this is only the ceiling for a process that dies without unwinding.
     */
    private const LOCK_TTL_SECONDS = 900;

    /** Ids per `whereIn` when counting how much of an announcement has landed. */
    private const ID_CHUNK = 5000;

    /**
     * @param  int  $chunk  Users loaded per query during the fan-out.
     */
    public function __construct(private readonly int $chunk = 500) {}

    /**
     * Notify everyone who has not already had this announcement.
     *
     * Safe to run twice, and that is the point — the second run is a no-op
     * that reports how much of the first one had landed. An interrupted send
     * is resumed by running exactly the same command again.
     *
     * @param  (callable(User, bool): void)|null  $onUser  Called per candidate
     *                                                     with the user and
     *                                                     whether they were
     *                                                     skipped as already
     *                                                     notified. For CLI
     *                                                     progress only.
     * @return array{audience: int, sent: int, skipped: int}
     *
     * @throws AnnouncementInProgressException if the same announcement is
     *                                         already being sent.
     */
    public function send(ProductUpdate $update, ?callable $onUser = null): array
    {
        // Non-blocking on purpose — see AnnouncementInProgressException. Note
        // the snapshot the guard depends on is taken inside the callback, so
        // it is taken inside the lock; hoisting it out here would put the read
        // back outside and quietly restore the race.
        $result = Cache::lock('announcement:'.$update->key, self::LOCK_TTL_SECONDS)
            ->get(fn () => $this->fanOut($update, $onUser));

        if ($result === false) {
            throw AnnouncementInProgressException::for($update->key);
        }

        return $result;
    }

    /**
     * Who this announcement would reach, without sending it.
     *
     * Counted rather than walked. The obvious implementation is the fan-out
     * with the writes switched off, which is what this used to be — and it
     * hydrates every account on the platform into a User model to arrive at
     * three integers, on the page an admin reloads while they are still
     * drafting the copy.
     *
     * @return array{audience: int, skipped: int, pending: int}
     */
    public function plan(ProductUpdate $update): array
    {
        $audience = $this->audience()->count();

        // Intersected with the audience rather than counted straight off the
        // notifications table: a recipient who has since deleted their account
        // still has rows there, and counting those would report a pending
        // figure short by however many of them there are.
        $skipped = collect(array_keys($this->alreadyNotified($update->key)))
            ->chunk(self::ID_CHUNK)
            ->sum(fn ($ids) => $this->audience()->whereKey($ids->all())->count());

        return [
            'audience' => $audience,
            'skipped' => $skipped,
            'pending' => $audience - $skipped,
        ];
    }

    /**
     * The fan-out itself. Only ever called holding the lock.
     *
     * @param  (callable(User, bool): void)|null  $onUser
     * @return array{audience: int, sent: int, skipped: int}
     */
    private function fanOut(ProductUpdate $update, ?callable $onUser): array
    {
        $alreadyNotified = $this->alreadyNotified($update->key);

        $audience = 0;
        $sent = 0;
        $skipped = 0;

        // lazyById rather than a get(): the audience is every account, and the
        // one moment this command is most needed is the one where that number
        // has grown. Chunked by primary key rather than by offset so rows
        // arriving mid-run cannot shift a page and skip somebody.
        $this->audience()->lazyById($this->chunk)->each(
            function (User $user) use ($update, $onUser, $alreadyNotified, &$audience, &$sent, &$skipped) {
                $audience++;

                // Checked against a set built once, not with a query per user.
                // The per-user version is the obvious way to write this and
                // costs one full scan of the notifications table per recipient,
                // because `data` is a text column with nothing to index — so
                // the shape that looks careful is the one that takes the site
                // down on the announcement that matters.
                $isRepeat = isset($alreadyNotified[$user->getKey()]);

                if ($onUser !== null) {
                    $onUser($user, $isRepeat);
                }

                if ($isRepeat) {
                    $skipped++;

                    return;
                }

                // Synchronous, so the row exists before the next iteration and
                // the guard above is never reasoning about a send that is still
                // in flight. An exception here aborts the run with everything
                // written so far already committed — which is exactly what
                // makes re-running the resume.
                $user->notify($update);

                $sent++;
            }
        );

        return ['audience' => $audience, 'sent' => $sent, 'skipped' => $skipped];
    }

    /**
     * Everybody who gets announcements.
     *
     * EVERY ACCOUNT, including unverified ones, which is deliberately wider
     * than NudgeInactiveBroadcasters. That command emails, so it needs an
     * address somebody has proved they own; this one writes a row in a bell
     * the routes already expose before verification — see routes/api.php,
     * where the notification endpoints sit outside the `verified` middleware
     * precisely because the first thing an account can be told is that it has
     * not verified yet. Excluding them would mean an account that verifies
     * next week silently misses everything said this week.
     *
     * Soft-deleted users are excluded by the model's global scope, and that is
     * the right default here rather than an oversight: a deleted account has
     * no bell to read.
     *
     * @return Builder<User>
     */
    private function audience(): Builder
    {
        return User::query();
    }

    /**
     * The ids that already have this announcement, as a set.
     *
     * One LIKE against the serialised payload, matching what
     * NotificationController does for the category filter and for the same
     * reason — `data` is a text column, so there is no JSON path to take and
     * no index to use either way. The key pattern is what makes the pattern
     * safe to interpolate: see ProductUpdate::KEY_PATTERN, which exists as
     * much for this line as for the humans typing it.
     *
     * THIS ONLY SEES AS FAR BACK AS RETENTION. PruneNotifications deletes rows
     * past `notifications.retention_days`, and a deleted row is a recipient
     * this cannot know about — so a key reused after that window sends the
     * announcement to everybody a second time. That is the correct behaviour
     * for a resend and a trap for a reused key, which is why the admin page
     * says so next to the retention figure.
     *
     * @return array<int|string, true>
     */
    private function alreadyNotified(string $key): array
    {
        $ids = DatabaseNotification::query()
            ->where('type', ProductUpdate::class)
            ->where('notifiable_type', (new User)->getMorphClass())
            ->where('data', 'like', '%"announcement":"'.$key.'"%')
            ->pluck('notifiable_id');

        return array_fill_keys($ids->all(), true);
    }
}
