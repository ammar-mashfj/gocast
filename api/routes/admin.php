<?php

use App\Http\Controllers\Admin\AccessRequestController;
use App\Http\Controllers\Admin\AccountController;
use App\Http\Controllers\Admin\AnnouncementController;
use App\Http\Controllers\Admin\AuthenticatedSessionController;
use App\Http\Controllers\Admin\DiscountController;
use App\Http\Controllers\Admin\InviteController;
use App\Http\Controllers\Admin\PaymentController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\RawEmailController;
use App\Http\Controllers\Admin\StationController;
use App\Http\Controllers\Admin\TwoFactorChallengeController;
use App\Http\Controllers\Admin\TwoFactorSetupController;
use App\Http\Controllers\Admin\WatermarkClipController;
use App\Http\Middleware\EnsureAdminTwoFactor;
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

    // Second sign-in step for an admin with two-factor on. Still guest:
    // nothing is signed in until the code is accepted.
    Route::get('two-factor', [TwoFactorChallengeController::class, 'create'])->name('two-factor.challenge');
    Route::post('two-factor', [TwoFactorChallengeController::class, 'store'])->name('two-factor.verify');
});

// Setting up two-factor, and signing out, are the only pages an admin without
// it can reach; EnsureAdminTwoFactor sends every other request here.
Route::middleware('auth:admin')->group(function () {
    Route::get('two-factor/setup', [TwoFactorSetupController::class, 'show'])->name('two-factor.setup');
    Route::post('two-factor/setup', [TwoFactorSetupController::class, 'store'])->name('two-factor.confirm');
    Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');
});

Route::middleware(['auth:admin', EnsureAdminTwoFactor::class])->group(function () {
    Route::redirect('/', '/admin/stations')->name('home');
    Route::get('stations', [StationController::class, 'index'])->name('stations.index');

    // One station's timeline. withTrashed() because a station in the trash is
    // precisely the one somebody needs the history of — "it disappeared" is a
    // support ticket, and the events leading up to the deletion are the
    // answer to it. The rows survive until PruneDeletedStations force-deletes
    // the station, at which point the cascade takes them with it.
    Route::get('stations/{station}', [StationController::class, 'show'])
        ->withTrashed()
        ->name('stations.show');

    // Homepage curation. POST rather than PATCH for the same reason as the
    // request actions below, and a toggle rather than a pair of routes
    // because the button's label already tells you which way it goes.
    Route::post('stations/{station}/feature', [StationController::class, 'feature'])->name('stations.feature');

    // A bigger (or smaller) library for one station, agreed with its owner.
    // Blank resets it to the install default.
    Route::post('stations/{station}/storage', [StationController::class, 'storage'])->name('stations.storage');

    // A plan change with no access request behind it — for an owner the admin
    // spotted rather than one who asked. Emails them the admin's own reason.
    // Two POSTs, like announcements: the dialog posts to `preview`, and only
    // the page that comes back can post to `upgrade`.
    Route::post('stations/{station}/upgrade/preview', [StationController::class, 'previewUpgrade'])->name('stations.upgrade.preview');
    Route::post('stations/{station}/upgrade', [StationController::class, 'upgrade'])->name('stations.upgrade');

    Route::get('requests', [AccessRequestController::class, 'index'])->name('requests.index');

    // Hand-provisioning. Creates an account and its first station outright,
    // for deals agreed off-platform — the one path onto a paid plan that does
    // not start with the person registering themselves.
    Route::get('accounts/create', [AccountController::class, 'create'])->name('accounts.create');
    Route::post('accounts', [AccountController::class, 'store'])->name('accounts.store');

    // Invite links. The self-serve path onto a paid plan: mint a link here,
    // email it from the same form, and the recipient redeems it at sign-up.
    Route::get('invites', [InviteController::class, 'index'])->name('invites.index');
    Route::post('invites', [InviteController::class, 'store'])->name('invites.store');
    // Sending an existing link again — a corrected address, or a nudge. The
    // mint form covers the first send, so this is only ever the second.
    Route::post('invites/{invite}/send', [InviteController::class, 'send'])->name('invites.send');
    Route::post('invites/{invite}/revoke', [InviteController::class, 'revoke'])->name('invites.revoke');

    // POST rather than PATCH throughout: these are plain Blade forms, and a
    // spoofed method buys nothing here while costing a hidden field on every
    // row. `approve` is the one that moves an account onto a paid plan.
    Route::post('requests/{entry}/approve', [AccessRequestController::class, 'approve'])->name('requests.approve');
    Route::post('requests/{entry}/renew', [AccessRequestController::class, 'renew'])->name('requests.renew');
    Route::post('requests/{entry}/dismiss', [AccessRequestController::class, 'dismiss'])->name('requests.dismiss');
    Route::post('requests/{entry}/revoke', [AccessRequestController::class, 'revoke'])->name('requests.revoke');
    Route::post('requests/{entry}/reopen', [AccessRequestController::class, 'reopen'])->name('requests.reopen');

    // Announcements — the in-app bell of every account at once, and the only
    // thing in this panel with no undo. Hence two POSTs rather than one: the
    // form posts to `preview`, and only the page that comes back can post to
    // `store`. Nothing is written until the second one.
    Route::get('announcements', [AnnouncementController::class, 'index'])->name('announcements.index');
    Route::post('announcements/preview', [AnnouncementController::class, 'preview'])->name('announcements.preview');
    Route::post('announcements', [AnnouncementController::class, 'store'])->name('announcements.store');

    // One-off email. Same two-POST shape as announcements and for a harder
    // version of the same reason: mail does not come back at all, and what the
    // admin typed is rendered by other code before anybody reads it. Nothing
    // leaves until the page that comes back from `preview` posts to `store`.
    Route::get('emails', [RawEmailController::class, 'index'])->name('emails.index');
    Route::post('emails/preview', [RawEmailController::class, 'preview'])->name('emails.preview');
    Route::post('emails', [RawEmailController::class, 'store'])->name('emails.store');

    // Checkout. Products and discounts are what the Get Pro dialog sells and
    // at what price — editing them here changes prices with no deploy.
    // Payments is the ledger; its two actions never touch an account directly.
    Route::get('payments', [PaymentController::class, 'index'])->name('payments.index');
    Route::post('payments/{payment}/recheck', [PaymentController::class, 'recheck'])->name('payments.recheck');
    Route::post('payments/{payment}/clear-review', [PaymentController::class, 'clearReview'])->name('payments.clear-review');
    Route::get('billing/products', [ProductController::class, 'index'])->name('products.index');
    Route::post('billing/products', [ProductController::class, 'store'])->name('products.store');
    Route::post('billing/products/{product}', [ProductController::class, 'update'])->name('products.update');
    Route::get('billing/discounts', [DiscountController::class, 'index'])->name('discounts.index');
    Route::post('billing/discounts', [DiscountController::class, 'store'])->name('discounts.store');
    Route::post('billing/discounts/{discount}', [DiscountController::class, 'update'])->name('discounts.update');

    Route::get('watermark', [WatermarkClipController::class, 'index'])->name('watermark.index');
    Route::post('watermark', [WatermarkClipController::class, 'store'])->name('watermark.store');
    Route::delete('watermark', [WatermarkClipController::class, 'destroy'])->name('watermark.destroy');
});
