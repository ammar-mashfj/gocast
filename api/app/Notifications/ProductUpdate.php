<?php

namespace App\Notifications;

use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use App\Services\AnnouncementSender;
use InvalidArgumentException;

/**
 * An announcement addressed to everybody: a product update, a maintenance
 * window, anything GoCast says about itself rather than about one account.
 *
 * THE FIRST NOTIFICATION WHOSE COPY IS AN ARGUMENT. Every other one computes
 * its wording from a model — the plan that expired, the station that went
 * quiet — so its class and its message are the same thing. This one is the
 * opposite: the class is a shape and the message arrives from outside it, which
 * is what lets a new announcement ship without a deploy of any kind. The
 * dashboard already renders it, because the bell renders payloads and not
 * classes: see BellPayload.
 *
 * NOT ShouldQueue, and it is the one bell notification for which that is a
 * decision rather than a default. Queueing is normally free; here it would
 * break the thing that keeps an announcement from being sent twice. The
 * duplicate guard in AnnouncementSender asks the notifications table who has
 * already been told, so a queued run that is interrupted halfway leaves its
 * remaining jobs invisible to that question — re-running the command would
 * send to everyone the queue had not drained yet, and then the queue would
 * deliver to them as well. Sent inline, the table is always the truth, and the
 * count the command prints is a count rather than a forecast.
 *
 * @see AnnouncementSender for the fan-out and the duplicate guard.
 */
class ProductUpdate extends BellNotification
{
    /**
     * What a `key` may contain.
     *
     * Narrow on purpose, and the narrowness is load-bearing twice over. The
     * key is matched with a LIKE against the serialised payload — the same
     * crude-but-honest approach NotificationController uses for the category
     * filter, and for the same reason: `data` is a text column. So `%` and `_`
     * have to be impossible rather than escaped, since an escape that behaves
     * identically on every driver is not free. It is also the handle a human
     * types at 2am to re-run an interrupted send, so it is lower case and has
     * no shell metacharacters in it.
     */
    public const KEY_PATTERN = '/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/';

    /**
     * @param  string  $key  Identifies this announcement forever. Two sends
     *                       carrying the same key are the same announcement,
     *                       and the second one reaches nobody who got the
     *                       first — so a dated slug ('2026-09-embed-player')
     *                       is right and 'update' is a trap.
     * @param  string  $headline  The row's one line. See BellPayload::$title.
     * @param  string|null  $summary  A sentence or two under it.
     * @param  list<string>  $points  The longer version, revealed in a dialog.
     *                                Empty means there is nothing more to say
     *                                and the row is a plain link — see below.
     * @param  string|null  $url  Where the button goes. A path like
     *                            `/dashboard/settings` is resolved against the
     *                            configured frontend origin; a full URL is
     *                            left alone. Defaults to the dashboard,
     *                            because an expanding notification must carry
     *                            an action and "you are already here" is a
     *                            truthful button.
     * @param  string|null  $linkLabel  Button text.
     * @param  string  $icon  Semantic key. Unknown ones wear a bell rather
     *                        than leaving a hole, so this may name a glyph the
     *                        deployed client has never heard of.
     * @param  string  $level  One of BellPayload::LEVELS. `warning` is for the
     *                         announcements that are not good news — a
     *                         maintenance window, a feature being retired.
     * @param  string|null  $detailHeading  The line above the points.
     */
    public function __construct(
        public readonly string $key,
        private readonly string $headline,
        private readonly ?string $summary = null,
        private readonly array $points = [],
        private readonly ?string $url = null,
        private readonly ?string $linkLabel = null,
        private readonly string $icon = 'megaphone',
        private readonly string $level = BellPayload::LEVEL_INFO,
        private readonly ?string $detailHeading = null,
    ) {
        // The key is the only field BellPayload will not check on our behalf,
        // and it is the one whose failure is silent: a key with a `%` in it
        // matches half the table, and a key that differs from last week's by a
        // character sends the same announcement to everyone a second time.
        if (preg_match(self::KEY_PATTERN, $key) !== 1) {
            throw new InvalidArgumentException(
                "Announcement key [{$key}] must be lower-case letters, digits, dots and dashes."
            );
        }

        // Everything else is BellPayload's business, but it is only asked at
        // toBell() — which happens once per recipient, inside the fan-out,
        // after the first few hundred rows are already written. Building the
        // payload here throws the same exceptions before anybody is notified.
        $this->buildPayload();
    }

    /**
     * Build one from decoded JSON — a file today, an admin form later.
     *
     * The validation is here rather than in the command because the command is
     * not going to be the only caller: an admin page posting a form wants the
     * same rules, and rules that live in a console class get reimplemented
     * slightly differently the first time something else needs them.
     *
     * @param  array<string, mixed>  $content
     */
    public static function fromArray(array $content): self
    {
        foreach (['key', 'headline'] as $required) {
            if (! isset($content[$required]) || ! is_string($content[$required]) || trim($content[$required]) === '') {
                throw new InvalidArgumentException("An announcement needs a non-empty [{$required}].");
            }
        }

        $points = $content['points'] ?? [];

        if (! is_array($points)) {
            throw new InvalidArgumentException('An announcement\'s [points] must be a list of sentences.');
        }

        // Rejected rather than filtered. A typo'd points list is somebody
        // about to send prose to every account on the platform, and quietly
        // dropping the bad entry sends a shorter announcement than they wrote.
        foreach ($points as $point) {
            if (! is_string($point) || trim($point) === '') {
                throw new InvalidArgumentException('Every announcement point has to be a non-empty string.');
            }
        }

        $string = function (string $field) use ($content): ?string {
            $value = $content[$field] ?? null;

            if ($value === null) {
                return null;
            }

            if (! is_string($value)) {
                throw new InvalidArgumentException("An announcement's [{$field}] must be a string.");
            }

            return trim($value) === '' ? null : $value;
        };

        return new self(
            key: $content['key'],
            headline: $content['headline'],
            summary: $string('summary'),
            points: array_values($points),
            url: $string('url'),
            linkLabel: $string('link_label'),
            icon: $string('icon') ?? 'megaphone',
            level: $string('level') ?? BellPayload::LEVEL_INFO,
            detailHeading: $string('detail_heading'),
        );
    }

    protected function toBell(object $notifiable): BellPayload
    {
        return $this->buildPayload();
    }

    /**
     * The payload, which does not depend on who is receiving it.
     *
     * That independence is the whole character of this notification and worth
     * saying out loud: an announcement says the same thing to everybody, so
     * nothing here reads the notifiable. The moment one wants to — "your
     * station", "your plan" — it is not an announcement any more and belongs
     * in a class of its own, where the copy can be tested against the model it
     * is describing.
     */
    private function buildPayload(): BellPayload
    {
        // An expanding action needs a destination: the mode is serialised
        // inside the action, so a payload that expands without one silently
        // drops the mode and becomes an unclickable row. The dashboard is the
        // honest fallback — every recipient has one, and the button reads as
        // "go and look" rather than as a link to nowhere.
        //
        // A PATH IS RESOLVED HERE rather than demanded from the caller, and
        // that is not convenience. Notification rows are never migrated, so an
        // absolute URL typed today is in everybody's bell forever — which is
        // fine for a blog post and a permanent bug for anything of ours,
        // because the origin differs between where an announcement is drafted
        // and where it is read. Somebody linking to the settings page writes
        // `/dashboard/settings` and it points at the right host in every
        // environment, now and after the domain moves.
        $url = match (true) {
            $this->url === null => BellPayload::appUrl('/dashboard'),
            str_starts_with($this->url, '/') => BellPayload::appUrl($this->url),
            default => $this->url,
        };
        $label = $this->linkLabel ?? ($this->url === null ? 'Open your dashboard' : 'Take a look');

        // Points are what decides the mode, not a separate switch. An
        // announcement with more to say than a row holds gets the dialog; a
        // one-liner ("scheduled maintenance tonight, 02:00–03:00 UTC") stays a
        // plain link, because a dialog that reveals nothing new is a click
        // charged for no information.
        $expands = $this->points !== [];

        return new BellPayload(
            title: $this->headline,
            body: $this->summary,
            icon: $this->icon,
            level: $this->level,
            // Always SYSTEM. The category names what a notification is about,
            // and an announcement is about GoCast — even one whose subject is
            // a station feature, because it is not about YOUR station. This is
            // also what makes the feed's category filter useful for these:
            // "show me what GoCast has told me" is one query.
            category: BellPayload::CATEGORY_SYSTEM,
            actionLabel: $label,
            actionUrl: $url,
            actionMode: $expands ? BellPayload::MODE_EXPAND : BellPayload::MODE_LINK,
            detailHeading: $expands ? ($this->detailHeading ?? "What's new") : null,
            detailPoints: $this->points,
            // The key is in meta because meta is the pass-through — the client
            // renders none of it — and because this is what the duplicate
            // guard reads back. It is the one piece of a notification payload
            // that is addressed to us rather than to the recipient.
            meta: ['announcement' => $this->key],
        );
    }
}
