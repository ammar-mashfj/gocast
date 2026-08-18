<?php

use App\Http\Middleware\EnsureEmailIsVerified;
use App\Http\Middleware\UseAuthTokenCookie;
use App\Http\Middleware\VerifyInternalKey;
use App\Services\StationLifecycleException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // The admin panel is registered on its own terms rather than
            // nested inside web.php: separate file, separate prefix, separate
            // guard. `web` is here for the session and CSRF the login form
            // and the panel's POST actions need.
            Route::middleware('web')
                ->prefix('admin')
                ->name('admin.')
                ->group(base_path('routes/admin.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Trust the Caddy/FrankenPHP container sitting directly in front of
        // Laravel so `$request->ip()` returns the real client IP from
        // X-Forwarded-For, not the proxy's own address. Without this, every
        // visitor looks like the same IP — breaking rate limits and the
        // login lockout counter.
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
            // Override Laravel's default so verification 403s carry a stable
            // `code: "email_unverified"` — frontend distinguishes from policy
            // 403s without string-matching the English message.
            'verified' => EnsureEmailIsVerified::class,
        ]);

        $middleware->api(prepend: [
            UseAuthTokenCookie::class,
        ]);

        // The API has no login page, so Laravel's default `route('login')`
        // target does not exist and would throw. Only the admin panel has a
        // browser login, so only admin paths get a redirect; everything else
        // keeps today's behaviour (a 401 for JSON callers).
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('admin', 'admin/*') ? route('admin.login') : null,
        );

        // Same reasoning in reverse: an already-signed-in admin who opens the
        // login page belongs in the panel, not on the API's welcome page.
        $middleware->redirectUsersTo(
            fn (Request $request) => $request->is('admin', 'admin/*') ? route('admin.stations.index') : '/',
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);

        // Station start/stop refusals are expected outcomes, not faults:
        // a plan without a free slot, or a stop attempted mid-broadcast.
        // Rendering them here keeps the controllers free of try/catch and
        // gives the SPA a stable `code` to branch on (upsell vs "end your
        // broadcast first") instead of matching on English text.
        // ...but only the faults are worth waking someone for. A plan limit or
        // a stop refused mid-broadcast is the system working as designed; a
        // container that died at boot is not. Without this split, adding
        // start-failure reporting would have buried it under refusals that are
        // supposed to happen.
        $exceptions->reportable(function (StationLifecycleException $e) {
            return $e->status >= 500;
        });

        $exceptions->render(function (StationLifecycleException $e, Request $request) {
            if (! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], $e->status);
        });
    })->create();
