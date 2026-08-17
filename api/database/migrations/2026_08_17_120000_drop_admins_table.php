<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops the admin account table along with the Filament admin panel.
 *
 * The original create migration is gone, so `dropIfExists` is what makes this
 * safe in both directions: a no-op on a fresh database, a real drop on one
 * that already ran the create. Rows in `activity_log` / `authentication_log`
 * that point at the old `admin` morph key are deliberately left in place —
 * they are historical audit records, and nothing reads them now that the
 * panel is gone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('admins');
    }

    public function down(): void
    {
        Schema::create('admins', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->text('two_factor_secret')->nullable();
            $table->text('two_factor_recovery_codes')->nullable();
            $table->timestamp('two_factor_confirmed_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
    }
};
