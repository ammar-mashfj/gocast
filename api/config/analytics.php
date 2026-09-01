<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Listener analytics
    |--------------------------------------------------------------------------
    |
    | HLS has no connection to count. A listener is a browser that keeps
    | checking in, and one that stops checking in has left — so every number
    | here is really a statement about how patient we are before calling
    | somebody gone. See App\Services\ListenerAnalytics.
    |
    */

    /**
     * Transport recorded when the player does not name one — 'hls' or
     * 'icecast'.
     *
     * The player normally sends its own, because only it knows whether it was
     * handed an HLS URL and actually used it or fell back to the Icecast
     * mount. This is the fallback for a client too old to say.
     *
     * The distinction decides whether a session is ADDED to the live count.
     * Icecast listeners hold a socket and are therefore already inside the
     * number `stations:sync-listeners` polls, so their sessions are recorded
     * for country, device and duration but never counted again. HLS listeners
     * are invisible to that poll, so theirs are the ones summed with it.
     */
    'player_transport' => env('ANALYTICS_PLAYER_TRANSPORT', 'hls'),

    /**
     * How often the player is told to check in, in seconds. Sent to the client
     * in the /listen response rather than hard-coded there, so the cadence can
     * be changed server-side without shipping a new frontend.
     */
    'beat_interval_seconds' => (int) env('ANALYTICS_BEAT_INTERVAL', 15),

    /**
     * How long a session counts as live after its last check-in. Three missed
     * beats: long enough to ride out a GC pause, a tab throttled in the
     * background, or a mobile network hiccup, short enough that the live
     * number reacts within one sweep of someone actually leaving.
     *
     * Must stay comfortably above `beat_interval_seconds` — if it drops below
     * it, every listener expires between their own beats and the live count
     * reads zero while people are listening.
     */
    'live_window_seconds' => (int) env('ANALYTICS_LIVE_WINDOW', 45),

    /**
     * How long after its last check-in a session is closed and written to the
     * database. Deliberately longer than `live_window_seconds`: dropping out
     * of the live count is cheap and reversible, but closing the session is
     * final, so a listener who reconnects inside a minute keeps one session
     * instead of splitting into two.
     */
    'idle_close_seconds' => (int) env('ANALYTICS_IDLE_CLOSE', 60),

    /**
     * Hard ceiling on a single session. A tab left open on a desk reports for
     * as long as the machine is awake, and without a cap one listener can
     * contribute days of "listening time" to a station's totals. Sessions past
     * this are closed by the sweep regardless of whether they are still
     * beating.
     */
    'max_session_hours' => (int) env('ANALYTICS_MAX_SESSION_HOURS', 12),

    /**
     * Minimum duration before a session counts as a real listen, in seconds.
     * The IAB podcast-measurement threshold, adopted here so our numbers mean
     * the same thing as everyone else's: someone who hits play and leaves
     * after five seconds is a click, not an audience.
     *
     * Short sessions are still stored — they are how you spot a stream that
     * everybody bounces off — they just don't inflate the headline count.
     */
    'min_listen_seconds' => (int) env('ANALYTICS_MIN_LISTEN_SECONDS', 60),

    /**
     * How long raw per-listener rows are kept, in days. The hourly and daily
     * rollups are permanent; this table is not. Pruning is what turns
     * `listener_sessions` from a table that grows forever into one that holds
     * a fixed size — after the first prune, deletes keep pace with inserts.
     *
     * Set to 0 to disable pruning entirely (don't, unless you have a reason).
     */
    'retention_days' => (int) env('ANALYTICS_RETENTION_DAYS', 90),

    /*
    |--------------------------------------------------------------------------
    | Geolocation
    |--------------------------------------------------------------------------
    |
    | Resolved once, when the ticket is issued, and never stored as an IP.
    | See App\Services\GeoResolver for the lookup order.
    |
    */

    'geo' => [
        /**
         * Path to a MaxMind GeoLite2-Country.mmdb. Optional: without both the
         * file and the geoip2/geoip2 package, country resolution falls back to
         * the CDN header and then to null. Nothing else degrades — a session
         * with no country is still a session.
         */
        'maxmind_database' => env('ANALYTICS_GEOIP_DATABASE', '/var/gocast/system/GeoLite2-Country.mmdb'),

        /**
         * Request header carrying a country code from the CDN, checked before
         * the local database because it costs nothing and is more accurate
         * (the edge sees the connection). Cloudflare sets CF-IPCountry.
         *
         * Only trusted because Laravel is not internet-facing — nginx/Caddy is
         * the only thing that can reach it. If that ever changes, this header
         * must be stripped at the edge or a visitor can pick their own country.
         */
        'country_header' => env('ANALYTICS_COUNTRY_HEADER', 'CF-IPCountry'),
    ],

];
