<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pro moved from a passive waitlist to "request access", so the form now asks
 * two qualifying questions instead of only taking an email.
 *
 * Both are nullable: this is a public lead form, and every required field costs
 * submissions. They exist to help decide who to invite first, not to gate.
 *
 * `social` is a plain string, NOT a validated URL — broadcasters answer this
 * with "@myshow" as often as with a full link, and rejecting the handle form
 * would throw away the commonest answer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waitlist_entries', function (Blueprint $table) {
            $table->string('social')->nullable()->after('plan');
            $table->text('message')->nullable()->after('social');
        });
    }

    public function down(): void
    {
        Schema::table('waitlist_entries', function (Blueprint $table) {
            $table->dropColumn(['social', 'message']);
        });
    }
};
