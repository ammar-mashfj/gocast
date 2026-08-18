<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recreates a standalone admin identity for the Blade admin panel.
 *
 * Deliberately narrower than the table 2026_08_17_120000 dropped: no 2FA
 * columns and no email_verified_at, because there is no self-service signup
 * or verification flow — admins exist only when `php artisan admin:create`
 * makes one. Add the 2FA columns back when 2FA is actually built.
 *
 * Separate from `users` on purpose: the admin credential must not be the
 * same credential a customer's browser carries around, so that a token or
 * session leak on the public app can never reach this panel.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admins', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admins');
    }
};
