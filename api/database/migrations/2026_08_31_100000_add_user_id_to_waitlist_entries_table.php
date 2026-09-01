<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a Pro request back to the account that sent it.
 *
 * Pro requests are authenticated now, so the requester is a real account with
 * real stations — which is the whole qualifying signal. Without this column
 * the reviewer is back to matching on the email string, and an account whose
 * login mail differs from the one they typed would never be found.
 *
 * Nullable because Custom/enterprise enquiries stay public: those genuinely
 * come from people evaluating the product before signing up, and they have no
 * account to point at. A null here means "stranger", not "missing data".
 *
 * nullOnDelete rather than cascade: a deleted account should not silently
 * erase the record that somebody asked, which is the one thing this table is
 * for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waitlist_entries', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->after('id')
                ->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('waitlist_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
