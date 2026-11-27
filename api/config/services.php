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

        // Signing secret (whsec_…) of the webhook pointed at
        // /api/webhooks/resend. Blank = the endpoint refuses every event.
        'webhook_secret' => env('RESEND_WEBHOOK_SECRET'),
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

    // Operator alerts (sign-ups, access requests, new stations, broadcasts)
    // sent to one admin Telegram chat. Blank token = alerts off. See
    // App\Services\AdminTelegram.
    // Crypto checkout (App\Services\Billing). The merchant key both creates
    // invoices and signs the webhooks OxaPay sends to /api/webhooks/oxapay,
    // so it never leaves the server. Blank = checkout and the webhook refuse.
    //
    // `driver`: `oxapay` talks to the real API (with `sandbox` for test
    // invoices); `fake` never leaves this machine — checkout lands straight
    // back on the account page and `php artisan billing:simulate` plays the
    // webhook. Refused in production (AppServiceProvider).
    //
    // `callback_url` overrides where OxaPay sends webhooks — an ngrok URL when
    // testing the sandbox from a laptop, since OxaPay never calls localhost.
    'oxapay' => [
        'driver' => env('OXAPAY_DRIVER', 'oxapay'),
        'merchant_key' => env('OXAPAY_MERCHANT_KEY'),
        'sandbox' => (bool) env('OXAPAY_SANDBOX', false),
        'base_url' => env('OXAPAY_BASE_URL', 'https://api.oxapay.com/v1'),
        'callback_url' => env('OXAPAY_CALLBACK_URL'),
        'invoice_lifetime_minutes' => (int) env('OXAPAY_INVOICE_LIFETIME', 60),
    ],

    // Card and PayPal through lava.top links (App\Services\LavaSales). No API
    // key: buyers pay on lava.top's own pages and the webhook at
    // /api/webhooks/lava extends Pro. `webhook_secret` is what lava.top sends
    // (X-Api-Key, or the Basic-auth password); blank = the webhook refuses.
    //
    // `pay_once` maps the USD amount paid for the pay-once product to its
    // months, since the webhook names the product but not the plan picked.
    // Keep it in step with the prices in lava.top.
    'lava' => [
        // Only for cancelling a subscription from the Account page; buying
        // never touches the API. Blank = cancelling there is refused.
        'api_key' => env('LAVA_API_KEY'),
        'base_url' => env('LAVA_BASE_URL', 'https://gate.lava.top'),
        'webhook_secret' => env('LAVA_WEBHOOK_SECRET'),
        'subscription_product_id' => env('LAVA_SUBSCRIPTION_PRODUCT_ID', '3cf32536-429c-473e-8fde-ae3403b35dd7'),
        'pay_once_product_id' => env('LAVA_PAY_ONCE_PRODUCT_ID', '52eb6015-701b-40ec-a45d-f93d93320927'),
        'pay_once' => [
            '52.00' => 3,
            '96.00' => 6,
            '160.00' => 12,
        ],
    ],

    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'admin_chat_id' => env('TELEGRAM_ADMIN_CHAT_ID'),
    ],

    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),

    'internal_api_key' => env('INTERNAL_API_KEY'),

    // Lifts the `public` rate limit for the Next.js server's own rendering
    // fetches (X-Render-Key). Deliberately not INTERNAL_API_KEY: that one
    // opens the /internal routes, and the frontend has no business there.
    'render_api_key' => env('RENDER_API_KEY'),

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    // Cloudflare Turnstile on sign-up, sign-in and forgot password. Blank secret = the
    // check is off and `turnstile_token` is not asked for (dev, tests).
    'turnstile' => [
        'secret' => env('TURNSTILE_SECRET_KEY'),
    ],

    'icecast' => [
        'source_password' => env('ICECAST_SOURCE_PASSWORD'),
        'admin_user' => env('ICECAST_ADMIN_USER', 'admin'),
        'admin_password' => env('ICECAST_ADMIN_PASSWORD'),

        // In-network base URL for the admin API (stations:sync-listeners polls
        // /admin/stats here). The default resolves the `icecast` compose
        // service by name, which is correct in both dev and prod — this is not
        // the public listener URL (NEXT_PUBLIC_ICECAST_URL).
        'url' => env('ICECAST_INTERNAL_URL', 'http://127.0.0.1:8000'),

        // Icecast's <limits><sources>: one per running station container, one
        // per live Free relay show, and the /standby feed. setup-native.sh
        // renders it into icecast.xml from this same variable, and
        // stations:sync-listeners warns at 80% of it.
        'max_sources' => (int) env('ICECAST_MAX_SOURCES', 500),
    ],

];
