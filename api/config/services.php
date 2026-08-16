<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),

    'internal_api_key' => env('INTERNAL_API_KEY'),

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    'icecast' => [
        'source_password' => env('ICECAST_SOURCE_PASSWORD'),
        'admin_user' => env('ICECAST_ADMIN_USER', 'admin'),
        'admin_password' => env('ICECAST_ADMIN_PASSWORD'),

        // In-network base URL for the admin API (stations:sync-listeners polls
        // /admin/stats here). The default resolves the `icecast` compose
        // service by name, which is correct in both dev and prod — this is not
        // the public listener URL (NEXT_PUBLIC_ICECAST_URL).
        'url' => env('ICECAST_INTERNAL_URL', 'http://icecast:8000'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Cloudflare Realtime TURN
    |--------------------------------------------------------------------------
    |
    | Relays WebRTC media for broadcasters whose network cannot carry
    | peer-to-peer UDP: VPNs with "WebRTC leak protection", firewalls that
    | block UDP outright, and symmetric NAT. Without a TURN server those users
    | negotiate a session successfully and then never connect — MediaMTX drops
    | it with "deadline exceeded while waiting connection" and the station
    | falls through to AutoDJ or silence.
    |
    | The key ID and API token are long-lived secrets and MUST stay server
    | side. Laravel exchanges them for short-lived ICE credentials that are
    | safe to hand the browser (see TurnCredentialService).
    |
    | Leaving these unset is supported: the app falls back to STUN only, which
    | is exactly today's behaviour — most broadcasters connect peer-to-peer and
    | never need a relay.
    |
    */
    'cloudflare_turn' => [
        'key_id' => env('CLOUDFLARE_TURN_KEY_ID'),
        'api_token' => env('CLOUDFLARE_TURN_API_TOKEN'),

        // Lifetime of the issued ICE credentials. Only needs to outlast the
        // WHIP handshake plus the broadcast itself — a relay allocation is
        // established at connect time and survives credential expiry, so this
        // does not cap broadcast length. An hour is generous.
        'ttl' => (int) env('CLOUDFLARE_TURN_TTL', 3600),
    ],

];
