<?php

namespace App\Notifications\Bell;

use InvalidArgumentException;
use JsonSerializable;

/**
 * The shape of every in-app notification, and the reason adding a new kind of
 * notification is a backend-only change.
 *
 * THE POINT. The dashboard bell renders from these fields and never from the
 * notification's class name. There is no `switch ($type)` on the client, no map
 * of type => component, and therefore nothing on the client to update when a
 * new notification ships: a class that returns one of these is immediately
 * renderable by a front end that was deployed before it existed.
 *
 * That only holds while the fields stay GENERIC. The temptation, the first time
 * a notification wants to show something the others don't, is to add a field
 * for it here — and three of those later the client is switching on which
 * fields are present, which is the type switch again wearing a different hat.
 * Anything type-specific goes in `meta`, which the client passes through
 * untouched and may use for analytics or a future richer renderer; it is not a
 * back door for layout.
 *
 * `icon` and `level` are SEMANTIC KEYS, not CSS classes or component names.
 * They name what the notification is, and the client decides what that looks
 * like — including what an unrecognised key looks like, which is the other half
 * of the guarantee: see the icon map in the client, which falls back rather
 * than rendering a blank. A backend deploy can invent `icon: 'trophy'` and an
 * old client shows a bell; it does not show a hole.
 */
class BellPayload implements JsonSerializable
{
    /*
    |--------------------------------------------------------------------------
    | Levels
    |--------------------------------------------------------------------------
    |
    | The notification's tone, which drives colour and nothing else. Kept to
    | four because a fifth would be a distinction the eye can't make in a
    | 400px dropdown.
    */

    public const LEVEL_INFO = 'info';

    public const LEVEL_SUCCESS = 'success';

    public const LEVEL_WARNING = 'warning';

    public const LEVEL_ERROR = 'error';

    /** @var list<string> */
    public const LEVELS = [
        self::LEVEL_INFO,
        self::LEVEL_SUCCESS,
        self::LEVEL_WARNING,
        self::LEVEL_ERROR,
    ];

    /*
    |--------------------------------------------------------------------------
    | Categories
    |--------------------------------------------------------------------------
    |
    | What part of the product the notification is about. Exists so the feed
    | can be filtered (see NotificationController::index), and so a future
    | "mute plan emails" preference has something coarser than a class name to
    | hang off.
    |
    | Deliberately a small, closed list: a category per notification type would
    | be no category at all.
    */

    /** The station, its broadcasts, its audience. */
    public const CATEGORY_STATION = 'station';

    /** Identity and security — email, password, sessions. */
    public const CATEGORY_ACCOUNT = 'account';

    /** Plans, invites, entitlements. */
    public const CATEGORY_PLAN = 'plan';

    /** Everything GoCast says about itself: announcements, maintenance. */
    public const CATEGORY_SYSTEM = 'system';

    /** @var list<string> */
    public const CATEGORIES = [
        self::CATEGORY_STATION,
        self::CATEGORY_ACCOUNT,
        self::CATEGORY_PLAN,
        self::CATEGORY_SYSTEM,
    ];

    /*
    |--------------------------------------------------------------------------
    | Action modes
    |--------------------------------------------------------------------------
    |
    | What clicking the notification DOES. The one thing in this payload that
    | is about presentation, and said in terms of intent rather than of a
    | widget, for the same reason `icon` and `level` are.
    |
    | `expand` means "there is more here than a row can hold, reveal it first".
    | The dashboard reveals it in a dialog — but nothing here says so, because
    | a phone would use a sheet and a digest would inline it, and all three are
    | honest readings of the same word. Naming the component instead would put
    | a value meaning nothing to any renderer without modals into a row that is
    | never migrated.
    |
    | The point of an explicit mode is that intent stops being INFERRED from
    | content. "Has detail, therefore expands" reads fine until a notification
    | wants detail that something other than the bell renders, or wants to
    | expand into something it has not written yet; then the rule is in the way
    | and the only place to change it is the client.
    */

    /** Go where `url` points. The default, and what every older row means. */
    public const MODE_LINK = 'link';

    /** Reveal `detail` first. `url` becomes the button inside it. */
    public const MODE_EXPAND = 'expand';

    /** @var list<string> */
    public const MODES = [
        self::MODE_LINK,
        self::MODE_EXPAND,
    ];

    /**
     * @param  string  $title  One line, sentence case, no trailing period. This
     *                         is the only part guaranteed to be read.
     * @param  string|null  $body  A sentence or two of detail. The dropdown
     *                             clamps it to two lines, so whatever matters
     *                             has to be in the first one.
     * @param  string  $icon  Semantic icon key — see the class docblock. Free
     *                        text on purpose: the client falls back, so the
     *                        backend may invent one without a client release.
     * @param  string  $level  One of self::LEVELS.
     * @param  string  $category  One of self::CATEGORIES.
     * @param  string|null  $actionLabel  Button text. Required with actionUrl.
     * @param  string|null  $actionUrl  Where the notification takes you.
     *                                  Absolute, because the bell is not the
     *                                  only thing that will render these.
     * @param  string  $actionMode  One of self::MODES. Lives inside the action
     *                              because it describes what clicking it does,
     *                              so it needs one to be meaningful.
     * @param  string|null  $detailHeading  Optional line above the points.
     * @param  list<string>  $detailPoints  The longer version, one plain
     *                                      sentence each — no markup, since
     *                                      every renderer formats these
     *                                      itself. Required by, and only by,
     *                                      MODE_EXPAND.
     * @param  array<string, mixed>  $meta  Type-specific extras. Not for layout.
     */
    public function __construct(
        public readonly string $title,
        public readonly ?string $body = null,
        public readonly string $icon = 'bell',
        public readonly string $level = self::LEVEL_INFO,
        public readonly string $category = self::CATEGORY_SYSTEM,
        public readonly ?string $actionLabel = null,
        public readonly ?string $actionUrl = null,
        public readonly string $actionMode = self::MODE_LINK,
        public readonly ?string $detailHeading = null,
        public readonly array $detailPoints = [],
        public readonly array $meta = [],
    ) {
        // Validated here rather than trusted, because the failure this catches
        // is silent otherwise: a typo'd level is stored, serialised, and shows
        // up as an uncoloured row weeks later with nothing pointing at the
        // line that wrote it. Notifications are dispatched from commands and
        // queued jobs where nobody is watching, so the only cheap moment to
        // catch it is construction — and the tests build every payload.
        if (trim($title) === '') {
            throw new InvalidArgumentException('A bell notification needs a title.');
        }

        if (! in_array($level, self::LEVELS, true)) {
            throw new InvalidArgumentException("Unknown notification level [{$level}].");
        }

        if (! in_array($category, self::CATEGORIES, true)) {
            throw new InvalidArgumentException("Unknown notification category [{$category}].");
        }

        // Half an action is worse than none: a label with no destination is a
        // button that does nothing, and a URL with no label is a button with
        // no text. Both render as broken rather than as absent.
        if (($actionLabel === null) !== ($actionUrl === null)) {
            throw new InvalidArgumentException(
                'A bell notification action needs both a label and a URL, or neither.'
            );
        }

        if (! in_array($actionMode, self::MODES, true)) {
            throw new InvalidArgumentException("Unknown notification action mode [{$actionMode}].");
        }

        // The three checks below are the label/url rule applied to the mode:
        // each combination they refuse serialises to something that renders as
        // BROKEN rather than as absent, which is the distinction worth throwing
        // over. An action that expands with nothing to reveal is an empty
        // dialog; detail written without the mode to reveal it is prose that
        // nothing will ever display, and both are discovered by a user weeks
        // later rather than by the code that wrote them.
        //
        // Note the first one is structural: the mode is serialised INSIDE the
        // action, so a payload that expands without one drops the mode on the
        // floor and silently becomes an ordinary unclickable row.
        if ($actionMode === self::MODE_EXPAND && $actionUrl === null) {
            throw new InvalidArgumentException(
                'A bell notification cannot expand without an action — the mode is part of it.'
            );
        }

        if ($actionMode === self::MODE_EXPAND && $detailPoints === []) {
            throw new InvalidArgumentException(
                'A bell notification that expands needs detail points to reveal.'
            );
        }

        if ($actionMode !== self::MODE_EXPAND && $detailPoints !== []) {
            throw new InvalidArgumentException(
                'A bell notification with detail points has to set the expand action mode.'
            );
        }

        if ($detailHeading !== null && $detailPoints === []) {
            throw new InvalidArgumentException(
                'A bell notification detail heading needs points underneath it.'
            );
        }

        foreach ($detailPoints as $point) {
            if (! is_string($point) || trim($point) === '') {
                throw new InvalidArgumentException(
                    'Every bell notification detail point has to be a non-empty string.'
                );
            }
        }
    }

    /**
     * A URL under the dashboard, built from the configured frontend origin.
     *
     * Every notification that links anywhere links into the SPA, and each one
     * doing its own `rtrim(config(...))` is how a double slash eventually ships
     * in an email-shaped thing nobody proof-reads.
     */
    public static function appUrl(string $path = ''): string
    {
        $origin = rtrim((string) config('services.frontend_url'), '/');

        return $origin.'/'.ltrim($path, '/');
    }

    /**
     * The stored form. This is what lands in `notifications.data` verbatim and
     * what NotificationResource hands to the client, so the key names here are
     * public API — changing one silently blanks that field on every row already
     * in the table.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'title' => $this->title,
            'body' => $this->body,
            'icon' => $this->icon,
            'level' => $this->level,
            'category' => $this->category,
            // Nested rather than flat `action_label` / `action_url`, so the
            // client tests one nullable object instead of remembering that two
            // fields are always null together.
            //
            // `mode` and `detail` are nested in here rather than sitting
            // alongside, because all four fields answer one question and only
            // mean anything read together. Rows written before they existed
            // carry neither key, which is why the client reads a missing mode
            // as `link` rather than requiring one.
            'action' => $this->actionUrl === null ? null : [
                'mode' => $this->actionMode,
                'label' => $this->actionLabel,
                'url' => $this->actionUrl,
                'detail' => $this->detailPoints === [] ? null : [
                    'heading' => $this->detailHeading,
                    'points' => $this->detailPoints,
                ],
            ],
            'meta' => (object) $this->meta,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
