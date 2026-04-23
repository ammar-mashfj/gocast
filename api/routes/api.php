<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\EmailVerificationController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\ListenerCountController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\PublicStationController;
use App\Http\Controllers\ResetLiveStationsController;
use App\Http\Controllers\StationController;
use App\Http\Controllers\StationNotifyController;
use App\Http\Controllers\StreamEndedController;
use App\Http\Controllers\StreamSessionController;
use App\Http\Controllers\StreamTokenController;
use App\Http\Controllers\StreamValidationController;
use App\Http\Controllers\UpdateListenerCountController;
use App\Http\Controllers\UpdateMetadataController;
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
        Route::post('/stations/{station}/stream-token', StreamTokenController::class);
        Route::apiResource('stations.sessions', StreamSessionController::class)
            ->only(['index', 'store', 'destroy']);
        Route::post('/upload/{type}', UploadController::class)
            ->middleware('throttle:uploads')
            ->whereIn('type', ['images', 'sounds']);
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

// Internal relay routes — authenticated by shared secret (VerifyInternalKey) and throttled at a higher ceiling.
Route::middleware(['internal', 'throttle:internal'])->group(function () {
    Route::post('/internal/validate-stream', StreamValidationController::class);
    Route::post('/internal/stream-ended', StreamEndedController::class);
    Route::post('/internal/metadata', UpdateMetadataController::class);
    Route::post('/internal/listeners', UpdateListenerCountController::class);
    Route::post('/internal/reset-live', ResetLiveStationsController::class);
});
