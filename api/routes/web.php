<?php

use App\Http\Controllers\UnsubscribeController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/**
 * The opt-out for invite emails. On the API domain rather than the front end
 * because the signature has to be checked by the app that minted it, and
 * because a link in a cold email must not depend on the Next server being up.
 *
 * `signed` on both verbs: the URL names the address it unsubscribes, so an
 * unsigned one would let anybody opt out anybody. GET asks, POST writes —
 * see UnsubscribeController for why that split is not optional.
 */
Route::middleware('signed')->group(function () {
    Route::get('unsubscribe', [UnsubscribeController::class, 'show'])->name('unsubscribe');
    Route::post('unsubscribe', [UnsubscribeController::class, 'store'])->name('unsubscribe.store');
});
