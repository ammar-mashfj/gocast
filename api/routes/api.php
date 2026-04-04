<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ListenerCountController;
use App\Http\Controllers\PublicStationController;
use App\Http\Controllers\StationController;
use App\Http\Controllers\StreamSessionController;
use App\Http\Controllers\StreamTokenController;
use App\Http\Controllers\StreamValidationController;
use App\Http\Controllers\UpdateListenerCountController;
use App\Http\Controllers\UploadController;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

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
    Route::post('/upload/{type}', UploadController::class)
        ->whereIn('type', ['images', 'sounds']);
});

// Public
Route::get('/public/stations/{slug}', [PublicStationController::class, 'show']);
Route::get('/public/stations/{slug}/listeners', [ListenerCountController::class, 'show']);

// Internal (relay)
Route::post('/internal/validate-stream', StreamValidationController::class);
Route::post('/internal/listeners', UpdateListenerCountController::class);
