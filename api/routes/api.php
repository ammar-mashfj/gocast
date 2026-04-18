<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\InternalTrackController;
use App\Http\Controllers\ListenerCountController;
use App\Http\Controllers\PublicStationController;
use App\Http\Controllers\ResetLiveStationsController;
use App\Http\Controllers\StationController;
use App\Http\Controllers\StreamEndedController;
use App\Http\Controllers\StreamSessionController;
use App\Http\Controllers\StreamTokenController;
use App\Http\Controllers\StreamValidationController;
use App\Http\Controllers\TrackController;
use App\Http\Controllers\UpdateListenerCountController;
use App\Http\Controllers\UpdateMetadataController;
use App\Http\Controllers\UploadController;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Auth routes — throttled aggressively to prevent brute-force attacks.
Route::middleware('throttle:auth')->prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::get('/google', [GoogleAuthController::class, 'redirect']);
    Route::get('/google/callback', [GoogleAuthController::class, 'callback']);
});

// Authenticated routes — protected by Sanctum token; no extra throttle (Laravel's global limiter applies).
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/email/verify/{id}/{hash}', function (EmailVerificationRequest $request) {
        $request->fulfill();

        return response()->json(['message' => 'Email verified.']);
    })->middleware('signed')->name('verification.verify');

    Route::post('/email/resend', function (Request $request) {
        $request->user()->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification email sent.']);
    })->middleware('throttle:6,1')->name('verification.send');

    Route::apiResource('stations', StationController::class);
    Route::post('/stations/{station}/stream-token', StreamTokenController::class);
    Route::apiResource('stations.sessions', StreamSessionController::class)
        ->only(['index', 'store', 'destroy']);
    Route::apiResource('stations.tracks', TrackController::class)
        ->only(['index', 'store', 'destroy']);
    Route::put('/stations/{station}/tracks/reorder', [TrackController::class, 'reorder']);

    Route::post('/upload/{type}', UploadController::class)
        ->middleware('throttle:uploads')
        ->whereIn('type', ['images', 'sounds']);
});

// Public routes — unauthenticated, throttled per-IP to protect against scraping.
Route::middleware('throttle:public')->group(function () {
    Route::get('/public/featured', [PublicStationController::class, 'featured']);
    Route::get('/public/stations/{slug}', [PublicStationController::class, 'show']);
    Route::get('/public/stations/{slug}/listeners', [ListenerCountController::class, 'show']);
});

// Internal relay routes — authenticated by shared secret (VerifyInternalKey) and throttled at a higher ceiling.
Route::middleware(['internal', 'throttle:internal'])->group(function () {
    Route::post('/internal/validate-stream', StreamValidationController::class);
    Route::post('/internal/stream-ended', StreamEndedController::class);
    Route::post('/internal/metadata', UpdateMetadataController::class);
    Route::post('/internal/listeners', UpdateListenerCountController::class);
    Route::post('/internal/reset-live', ResetLiveStationsController::class);
    Route::get('/internal/tracks/{track}', InternalTrackController::class);
});
