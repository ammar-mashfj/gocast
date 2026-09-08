<?php

use App\Http\Controllers\Admin\AccessRequestController;
use App\Http\Controllers\Admin\AccountController;
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

    // Homepage curation. POST rather than PATCH for the same reason as the
    // request actions below, and a toggle rather than a pair of routes
    // because the button's label already tells you which way it goes.
    Route::post('stations/{station}/feature', [StationController::class, 'feature'])->name('stations.feature');

    Route::get('requests', [AccessRequestController::class, 'index'])->name('requests.index');

    // Hand-provisioning. Creates an account and its first station outright,
    // for deals agreed off-platform — the one path onto a paid plan that does
    // not start with the person registering themselves.
    Route::get('accounts/create', [AccountController::class, 'create'])->name('accounts.create');
    Route::post('accounts', [AccountController::class, 'store'])->name('accounts.store');

    // POST rather than PATCH throughout: these are plain Blade forms, and a
    // spoofed method buys nothing here while costing a hidden field on every
    // row. `approve` is the one that moves an account onto a paid plan.
    Route::post('requests/{entry}/approve', [AccessRequestController::class, 'approve'])->name('requests.approve');
    Route::post('requests/{entry}/dismiss', [AccessRequestController::class, 'dismiss'])->name('requests.dismiss');
    Route::post('requests/{entry}/revoke', [AccessRequestController::class, 'revoke'])->name('requests.revoke');
    Route::post('requests/{entry}/reopen', [AccessRequestController::class, 'reopen'])->name('requests.reopen');

    Route::get('watermark', [WatermarkClipController::class, 'index'])->name('watermark.index');
    Route::post('watermark', [WatermarkClipController::class, 'store'])->name('watermark.store');
    Route::delete('watermark', [WatermarkClipController::class, 'destroy'])->name('watermark.destroy');

    Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');
});
