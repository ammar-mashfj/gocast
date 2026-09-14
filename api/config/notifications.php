<?php

return [

    /*
    |--------------------------------------------------------------------------
    | In-app notifications ("the bell")
    |--------------------------------------------------------------------------
    |
    | Settings for the database-channel notifications the dashboard bell reads.
    | See App\Notifications\Bell\BellNotification for the payload contract every
    | one of them has to satisfy.
    |
    */

    /**
     * How long a notification is kept, in days.
     *
     * Unlike the station event log, this table is NOT driven by failure: rows
     * arrive when something happens to an account, and accounts are few and
     * quiet. It still needs a ceiling, because nothing else deletes from it and
     * a row nobody has read in three months is not going to be read.
     *
     * Longer than the station event window (30 days) on purpose. These rows are
     * addressed to a person rather than to whoever is debugging tonight, and
     * somebody who has been away for a month should still find out their plan
     * expired while they were gone.
     *
     * One caller depends on this window beyond display: NudgeInactiveBroadcasters
     * treats "a row of this type exists" as "already nudged", so the retention
     * has to comfortably exceed the 7-day window that command looks at, or a
     * long-dormant account could be nudged twice. 90 days clears that by an
     * order of magnitude.
     *
     * Set to 0 to disable pruning entirely.
     */
    'retention_days' => (int) env('NOTIFICATION_RETENTION_DAYS', 90),

    /**
     * How many notifications one page of the feed carries.
     *
     * The bell dropdown is the only thing reading the feed today, and it does
     * page — its "Load older" button is what appears when a page runs out. So
     * this is really "how far somebody scrolls before they meet a button".
     * Twenty is a couple of panel-heights: far enough that most people never
     * reach it, small enough that opening the bell is one short query.
     */
    'per_page' => (int) env('NOTIFICATION_PER_PAGE', 20),

    /**
     * Ceiling on the unread badge.
     *
     * Counting exactly is cheap, but rendering "1,204" in a badge is not
     * information — past this point the only true statement is "a lot", and the
     * client renders it as "99+". Kept server-side so every client agrees.
     */
    'unread_count_cap' => (int) env('NOTIFICATION_UNREAD_COUNT_CAP', 99),

];
