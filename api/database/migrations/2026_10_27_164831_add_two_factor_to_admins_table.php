<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Time-based one-time codes (TOTP) for the admin panel, added after the
 * 2026-10-27 probe made 53 password guesses at /admin/login.
 *
 * `two_factor_secret` is stored encrypted (the model casts it). It is set when
 * setup starts and only counts once `two_factor_confirmed_at` is set, after
 * the admin has typed a valid code — so an abandoned setup never locks
 * anybody out. `two_factor_last_step` is the 30-second window of the last
 * accepted code, so one code cannot be used twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admins', function (Blueprint $table) {
            $table->text('two_factor_secret')->nullable()->after('password');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_secret');
            $table->unsignedBigInteger('two_factor_last_step')->nullable()->after('two_factor_confirmed_at');
        });
    }

    public function down(): void
    {
        Schema::table('admins', function (Blueprint $table) {
            $table->dropColumn(['two_factor_secret', 'two_factor_confirmed_at', 'two_factor_last_step']);
        });
    }
};
