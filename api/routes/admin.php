<?php

use App\Http\Controllers\Admin\AuthenticatedSessionController;
use App\Http\Controllers\Admin\StationController;
use App\Http\Controllers\Admin\WatermarkClipController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
|
| Kept out of web.php and api.php on purpose: the admin panel is a separate
| surface with its own guard, controllers, views and CSS bundle, and nothing
| here is reachable with a customer's credentials. Registered with the
| `admin` prefix and name prefix in bootstrap/app.php.
|
*/

Route::middleware('guest:admin')->group(function () {
    Route::get('login', [AuthenticatedSessionController::class, 'create'])->name('login');
    Route::post('login', [AuthenticatedSessionController::class, 'store'])->name('login.store');
});

Route::middleware('auth:admin')->group(function () {
    Route::redirect('/', '/admin/stations')->name('home');
    Route::get('stations', [StationController::class, 'index'])->name('stations.index');

    Route::get('watermark', [WatermarkClipController::class, 'index'])->name('watermark.index');
    Route::post('watermark', [WatermarkClipController::class, 'store'])->name('watermark.store');
    Route::delete('watermark', [WatermarkClipController::class, 'destroy'])->name('watermark.destroy');

    Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');
});
