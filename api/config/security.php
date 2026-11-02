<?php

/*
|--------------------------------------------------------------------------
| Security signals
|--------------------------------------------------------------------------
|
| Thresholds for the Telegram alerts added after the 2026-10-27 probing
| incident, when the only reason anyone noticed was an operator spotting an
| odd station name. Nothing here blocks a request; it only decides when the
| admin chat hears about one.
|
*/

return [

    /*
    | Sign-up bursts. Every sign-up already gets its own Telegram message, but
    | nothing says when several come from one address — the probe registered
    | five accounts from one IP in 45 minutes.
    */
    'registrations' => [
        'per_ip' => (int) env('SECURITY_REGISTRATIONS_PER_IP', 3),
        'total' => (int) env('SECURITY_REGISTRATIONS_TOTAL', 20),
        'window_minutes' => (int) env('SECURITY_REGISTRATIONS_WINDOW_MINUTES', 60),
    ],

    /*
    | Out-of-band callback services (OAST). A value pointing at one of these is
    | somebody testing whether our servers will fetch a URL they chose. Matched
    | as a host suffix anywhere in request input and in the User-Agent and
    | Referer headers.
    */
    'callback_domains' => [
        'dnslog.cn', 'dnslog.link', 'ceye.io', 'interact.sh', 'interactsh.com',
        'oast.pro', 'oast.live', 'oast.site', 'oast.online', 'oast.fun', 'oast.me',
        'burpcollaborator.net', 'oastify.com', 'canarytokens.com', 'requestbin.net',
        'pipedream.net', 'webhook.site', 'dnslog.pw', 'eyes.sh', 'xss.ht', 'bxss.me',
    ],

    /*
    | nginx access-log scan (security:scan-access-logs, every five minutes).
    | Counts are per client IP per scan.
    */
    'access_logs' => [
        // 4xx responses in the app and API logs, except 401 (an expired token
        // polling is routine) and 444 (counted on its own below). The probe's
        // path sweep was ~60 guesses in a minute.
        'files' => array_filter(explode(',', (string) env(
            'SECURITY_ACCESS_LOGS',
            '/var/log/nginx/gocast-api.access.log,/var/log/nginx/gocast-app.access.log',
        ))),
        'errors_per_ip' => (int) env('SECURITY_ERRORS_PER_IP', 60),

        // Connections closed with 444 for not coming through Cloudflare. Any
        // public IP gets a trickle of these from internet-wide scanners; one
        // address making this many is somebody using the origin on purpose.
        'blocked_files' => array_filter(explode(',', (string) env(
            'SECURITY_BLOCKED_LOGS',
            '/var/log/nginx/gocast-api.access.log,/var/log/nginx/gocast-app.access.log,/var/log/nginx/gocast-stream.access.log',
        ))),
        'blocked_per_ip' => (int) env('SECURITY_BLOCKED_PER_IP', 30),

        // Upper bound on what one scan reads from a file, so a log that grew
        // by gigabytes (a flood) cannot hold the scheduler for minutes.
        'max_bytes' => (int) env('SECURITY_ACCESS_LOG_MAX_BYTES', 20 * 1024 * 1024),
    ],

    /*
    | Every admin must set up two-factor sign-in before using the panel
    | (EnsureAdminTwoFactor). Only for an emergency on the server; recovery
    | for one admin is `php artisan admin:reset-two-factor`.
    */
    'admin_two_factor_required' => (bool) env('ADMIN_TWO_FACTOR_REQUIRED', true),

    /*
    | security:check-cloudflare-ranges compares this installed file with
    | Cloudflare's published lists, weekly.
    */
    'cloudflare_realip_conf' => env('SECURITY_CLOUDFLARE_REALIP_CONF', '/etc/nginx/conf.d/cloudflare-realip.conf'),

    /*
    | email:refresh-disposable writes the maintained throwaway-domain list
    | here, weekly. Under storage/ rather than resources/ because the server is
    | a git checkout: rewriting a tracked file would stop the next deploy's
    | `git pull --ff-only`. Until the first refresh, DisposableEmail falls back
    | to the copy bundled in resources/data/.
    */
    'disposable_domains_list' => storage_path('app/disposable-email-domains.txt'),

    'disposable_domains_source' => 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf',

];
