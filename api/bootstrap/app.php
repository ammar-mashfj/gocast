<?php

use App\Http\Middleware\EnsureEmailIsVerified;
use App\Http\Middleware\ExpireIdleAdminSession;
use App\Http\Middleware\UseAuthTokenCookie;
use App\Http\Middleware\VerifyInternalKey;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Trust the Caddy/FrankenPHP container sitting directly in front of
        // Laravel so `$request->ip()` returns the real client IP from
        // X-Forwarded-For, not the proxy's own address. Without this, every
        // visitor looks like the same IP — breaking rate limits, the login
        // lockout counter, and admin login-abuse detection.
        //
        // '*' is safe because Laravel is never internet-facing in this
        // setup: Caddy is the only thing that can reach it. Behind
        // Cloudflare, Caddy's `trusted_proxies cloudflare` directive
        // (see api/Caddyfile.cloudflare) ensures the chain terminates at
        // the real client IP before it reaches Laravel.
        $middleware->trustProxies(
            at: '*',
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO,
        );

        $middleware->alias([
            'internal' => VerifyInternalKey::class,
            'admin.idle' => ExpireIdleAdminSession::class,
            // Override Laravel's default so verification 403s carry a stable
            // `code: "email_unverified"` — frontend distinguishes from policy
            // 403s without string-matching the English message.
            'verified' => EnsureEmailIsVerified::class,
        ]);

        $middleware->api(prepend: [
            UseAuthTokenCookie::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);
    })->create();
