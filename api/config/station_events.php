<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Station event log
    |--------------------------------------------------------------------------
    |
    | The per-station timeline behind the admin station page. See
    | App\Models\StationEvent for what goes in it and why it is not the same
    | table as activity_log.
    |
    */

    /**
     * How long events are kept, in days.
     *
     * This is the only thing standing between the log and unbounded growth,
     * and the growth is not theoretical: a station whose Icecast source is
     * flapping reports a connect and a disconnect every few seconds, so one
     * misconfigured station can out-write every real one combined. After the
     * first prune, deletes come into balance with inserts and the table stops
     * growing.
     *
     * Shorter than the listener retention window on purpose. Listener rows
     * feed permanent rollups and are worth keeping a quarter of; these rows
     * feed nothing but a human reading a timeline, and nobody debugs a station
     * incident from two months ago.
     *
     * Set to 0 to disable pruning entirely (don't, unless you have a reason).
     */
    'retention_days' => (int) env('STATION_EVENT_RETENTION_DAYS', 30),

    /**
     * How many events one station may write per minute before the rest of that
     * minute is dropped.
     *
     * The endpoint is reachable by every station container, and a container in
     * a crash-restart loop is the normal way this table gets hammered — it is
     * not an attack, just a station having a bad night. The cap turns "one
     * broken station fills the disk" into "one broken station's timeline has a
     * gap", which is the correct failure. Set generously: a healthy station
     * reports a handful of events an hour, so anything near this ceiling is
     * already the pathological case the log is there to reveal.
     *
     * Set to 0 to disable the cap.
     */
    'max_per_minute' => (int) env('STATION_EVENT_MAX_PER_MINUTE', 60),

];
