<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    // `broadcasting/auth` is a sibling of `api/*`, not a child, so the
    // wildcard does not reach it. Without it listed here the browser's
    // preflight fails and the failure surfaces as a CORS error — which reads
    // like a server misconfiguration rather than the one-line omission it is.
    //
    // `supports_credentials` below is already true, which is what lets the
    // `token` cookie ride along on the subscription request.
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'broadcasting/auth'],

    'allowed_methods' => ['*'],

    'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:3000')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
