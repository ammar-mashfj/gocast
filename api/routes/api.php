<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BroadcastTokenController;
use App\Http\Controllers\EmailVerificationController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\HarborAuthController;
use App\Http\Controllers\ListenerCountController;
use App\Http\Controllers\MetricsController;
use App\Http\Controllers\NowPlayingController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\PublicStationController;
use App\Http\Controllers\StationController;
use App\Http\Controllers\StationEventController;
use App\Http\Controllers\StationNotifyController;
use App\Http\Controllers\StationPowerController;
use App\Http\Controllers\StationStatusController;
use App\Http\Controllers\StreamSessionController;
use App\Http\Controllers\TrackController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\WaitlistController;
use Illuminate\Support\Facades\Route;

// Auth routes — throttled aggressively to prevent brute-force attacks.
Route::middleware('throttle:auth')->prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::get('/google', [GoogleAuthController::class, 'redirect']);
    Route::get('/google/callback', [GoogleAuthController::class, 'callback']);

    // Password reset — always-200 on /forgot to prevent enumeration, separate
    // tighter throttle (3/min) on code requests so attackers can't spam the
    // endpoint to trigger emails / DoS the mail provider.
    Route::post('/password/forgot', [PasswordResetController::class, 'forgot'])
        ->middleware('throttle:3,1')
        ->name('password.forgot');
    Route::post('/password/reset', [PasswordResetController::class, 'reset'])
        ->middleware('throttle:10,1')
        ->name('password.reset');
});

// Authenticated routes — protected by Sanctum token; no extra throttle (Laravel's global limiter applies).
Route::middleware('auth:sanctum')->group(function () {
    // Always accessible while authenticated — needed to resolve identity, sign out,
    // complete verification, or manage the account even when the email isn't verified yet.
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    // 6-digit code flow. /resend issues a fresh code (throttled against spam);
    // /verify validates a submitted code and marks the email verified.
    Route::post('/email/resend', [EmailVerificationController::class, 'send'])
        ->middleware('throttle:6,1')
        ->name('verification.send');

    Route::post('/email/verify', [EmailVerificationController::class, 'verify'])
        ->middleware('throttle:10,1')
        ->name('verification.verify');

    // Account self-service — kept outside `verified` so a user who mistyped their
    // email on signup can correct it (UpdateProfileRequest clears verification on
    // email change) or delete the account without first verifying.
    Route::patch('/account/profile', [AccountController::class, 'updateProfile']);
    Route::patch('/account/password', [AccountController::class, 'updatePassword']);
    Route::delete('/account', [AccountController::class, 'destroy']);

    // Productive routes — require a verified email. EnsureEmailIsVerified responds
    // with a 403 JSON ("Your email address is not verified.") for API clients.
    Route::middleware('verified')->group(function () {
        Route::apiResource('stations', StationController::class);
        Route::apiResource('stations.sessions', StreamSessionController::class)
            ->only(['index', 'store', 'destroy']);
        Route::post('/upload/{type}', UploadController::class)
            ->middleware('throttle:uploads')
            ->whereIn('type', ['images', 'sounds']);

        // Issues a short-lived, station-scoped broadcaster token plus the
        // WebSocket URL to publish to. The SPA sends the token as the password
        // in the webcast hello frame, so harbor's auth callback can verify the
        // publisher owns the station — without ever exposing the long-lived
        // Sanctum auth token to URLs / proxy logs.
        //
        // Inside `verified` alongside the other productive routes: going live is
        // exactly the kind of action an unverified signup shouldn't reach, and
        // owning a station already requires verification.
        Route::post('/auth/broadcast-token', BroadcastTokenController::class)
            ->middleware('throttle:30,1');

        // Station power switch. Creating a station configures it; starting it
        // is what spawns a Liquidsoap container and puts a mount on Icecast.
        // Throttled because each start is a docker run — a hammered button
        // shouldn't be able to thrash the daemon.
        Route::post('/stations/{station:slug}/start', [StationPowerController::class, 'start'])
            ->middleware('throttle:20,1');
        Route::post('/stations/{station:slug}/stop', [StationPowerController::class, 'stop'])
            ->middleware('throttle:20,1');

        // Skip the current AutoDJ track — a telnet command to the running
        // container, no restart involved.
        Route::post('/stations/{station:slug}/skip', [StationPowerController::class, 'skip'])
            ->middleware('throttle:30,1');

        // Live audio state, read from the station's own container. Polled by
        // the dashboard while a station is starting and by the broadcast
        // pre-flight before publishing, so it gets a roomier limit.
        Route::get('/stations/{station:slug}/status', StationStatusController::class)
            ->middleware('throttle:120,1');

        // AutoDJ tracks — list, upload, reorder, edit, delete. The reorder
        // endpoint is registered before the implicit-binding {track} update
        // so "reorder" doesn't get parsed as a ULID.
        Route::get('/stations/{station:slug}/tracks', [TrackController::class, 'index']);
        Route::post('/stations/{station:slug}/tracks', [TrackController::class, 'store'])
            ->middleware('throttle:uploads');
        Route::patch('/stations/{station:slug}/tracks/reorder', [TrackController::class, 'reorder']);
        Route::patch('/tracks/{track}', [TrackController::class, 'update']);
        Route::delete('/tracks/{track}', [TrackController::class, 'destroy']);
    });
});

// Public routes — unauthenticated, throttled per-IP to protect against scraping.
Route::middleware('throttle:public')->group(function () {
    Route::get('/public/featured', [PublicStationController::class, 'featured']);
    Route::get('/public/stations', [PublicStationController::class, 'index']);
    Route::get('/public/genres', [PublicStationController::class, 'genres']);
    Route::get('/public/stations/{slug}', [PublicStationController::class, 'show']);
    Route::get('/public/stations/{slug}/listeners', [ListenerCountController::class, 'show']);
    // Tighter throttle on the email-capture endpoint specifically — abuse vector is high.
    Route::post('/public/stations/{slug}/notify', [StationNotifyController::class, 'store'])
        ->middleware('throttle:5,60');
});

// Waitlist signup — public, tightly throttled to 5 requests per IP per hour.
Route::middleware('throttle:5,60')->group(function () {
    Route::post('/waitlist', [WaitlistController::class, 'store']);
});

// Liquidsoap harbor auth callback and the now-playing push. Both are
// server-to-server calls from containers we control; the `internal`
// middleware enforces the shared X-Internal-Key secret so internet attackers
// can't admit publishers or inject now-playing metadata even though the api
// is internet-facing.
Route::middleware(['internal', 'throttle:internal'])->group(function () {
    // Called once per broadcaster connection attempt. The container fails
    // closed on anything but a 200, so this is the gate on the ingest port.
    Route::post('/internal/harbor-auth', HarborAuthController::class);

    // Per-station Liquidsoap pushes here on every track change; cached in
    // Redis for the listener-side now-playing API.
    Route::post('/internal/now-playing', NowPlayingController::class);

    // Container lifecycle: boot, shutdown, Icecast connect/disconnect, and
    // live-input silence. A fast path for state Laravel would otherwise have
    // to infer by polling — never load-bearing, since a container that dies
    // at boot reports nothing at all.
    Route::post('/internal/station-event', StationEventController::class);

    // Prometheus-format metrics. Scrape with X-Internal-Key from a
    // Prometheus / Grafana Agent / Vector pipeline. Excluded from the
    // public throttle bucket because scrapes are scheduled, not bursty.
    Route::get('/internal/metrics', MetricsController::class)->withoutMiddleware('throttle:internal');
});
