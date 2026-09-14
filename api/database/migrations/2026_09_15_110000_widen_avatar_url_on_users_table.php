<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Widen users.avatar_url from the default VARCHAR(255) to 2048.
 *
 * Google returns profile photos as lh3.googleusercontent.com/a-/ALV-Uj… URLs
 * that routinely run past a kilobyte. With 'strict' => true in
 * config/database.php MySQL rejects the oversized value outright (1406 Data
 * too long) instead of truncating it, and the write sits outside the only
 * try/catch in GoogleAuthController — so the QueryException escaped the
 * callback and the popup died on a 500 with no auth cookie and no
 * postMessage. The person could not sign up at all, and saw nothing they
 * could act on.
 *
 * 2048 is the practical browser URL ceiling. Safe to widen here because
 * avatar_url carries no index or unique constraint, so InnoDB's 3072-byte key
 * limit does not apply.
 *
 * Widening alone is not the fix — Google is free to exceed 2048 too.
 * GoogleAuthController::avatarUrl() drops anything longer rather than storing
 * it, so the column width is a budget, not a guarantee.
 *
 * No down(): narrowing back to 255 would fail with the very error this
 * migration exists to prevent on any row that has since grown past it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // ->nullable() must be restated: since Laravel 11, change() drops
            // every attribute not named here, and a NOT NULL avatar_url would
            // break every password-registered account (they all have null).
            $table->string('avatar_url', 2048)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Intentionally irreversible.
    }
};
