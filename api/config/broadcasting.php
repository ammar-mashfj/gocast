<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Broadcaster
    |--------------------------------------------------------------------------
    |
    | `log` is the safe default and the server-side kill switch: events still
    | dispatch and still queue, they just write a line instead of reaching a
    | socket. Production sets `pusher`; nothing else has to change to turn the
    | feature off again.
    |
    */

    'default' => env('BROADCAST_CONNECTION', 'log'),

    /*
    |--------------------------------------------------------------------------
    | Broadcast Connections
    |--------------------------------------------------------------------------
    */

    'connections' => [

        /*
         * Ably, spoken to over its Pusher-compatible endpoint.
         *
         * NOT `ably/laravel-broadcaster`. That package is Ably's own protocol,
         * and pairing it with the browser needs @ably/laravel-echo — a FORK of
         * Echo with Ably channel namespaces and Ably error codes. Migrating
         * off it later means replacing packages on both sides and rewriting
         * channel names.
         *
         * Reverb speaks the Pusher protocol natively, so going through the
         * compatibility endpoint means the eventual move is an env change on
         * the server and one line in client/lib/echo.ts. The browser bundle
         * does not change packages at all.
         *
         * The documented casualty of a Pusher client against Ably is
         * `broadcast()->toOthers()`, which needs the socket id of the client
         * that caused the event. We never call it: every event here
         * originates from a Liquidsoap container calling Laravel, so there is
         * no originating browser socket to exclude.
         */
        'pusher' => [
            'driver' => 'pusher',
            'key' => env('PUSHER_APP_KEY'),
            'secret' => env('PUSHER_APP_SECRET'),
            'app_id' => env('PUSHER_APP_ID'),
            'options' => [
                // Ably: main.pusher.ably.net. Left unset this falls back to
                // Pusher's own cluster host, which will reject our key with an
                // error that says nothing about the real problem.
                'host' => env('PUSHER_HOST'),
                'port' => (int) env('PUSHER_PORT', 443),
                'scheme' => env('PUSHER_SCHEME', 'https'),
                'useTLS' => env('PUSHER_SCHEME', 'https') === 'https',
                // Required by the SDK's signature, unused when `host` is set
                // explicitly. Ably has no clusters.
                'cluster' => env('PUSHER_APP_CLUSTER', 'mt1'),
                // The container callbacks that trigger these events are
                // already on a 5s budget of their own; a broadcaster that
                // hangs must not hold a queue worker indefinitely.
                'timeout' => 10,
            ],
            'client_options' => [],
        ],

        /*
         * The kill switch, and what tests run against. Every broadcast writes
         * to the log channel and goes nowhere.
         */
        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];
