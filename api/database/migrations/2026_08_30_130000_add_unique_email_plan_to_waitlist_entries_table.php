<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One request per email PER PLAN, not per email.
 *
 * `plan` is part of the key on purpose: the same person may legitimately
 * request Pro now and an add-on later, and a unique index on `email` alone
 * would reject the second one.
 *
 * The constraint alone is not the fix — a bare unique index turns a resubmit
 * into a QueryException, i.e. a 500. It pairs with `updateOrCreate` in
 * WaitlistController, so someone who resubmits to correct a typo'd link
 * updates their row instead of being rejected.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Any duplicates already captured would make the index creation fail,
        // so collapse them first, keeping the most recent row per (email, plan).
        $keepIds = DB::table('waitlist_entries')
            ->selectRaw('MAX(id) as id')
            ->groupBy('email', 'plan')
            ->pluck('id')
            ->all();

        if ($keepIds !== []) {
            DB::table('waitlist_entries')->whereNotIn('id', $keepIds)->delete();
        }

        Schema::table('waitlist_entries', function (Blueprint $table) {
            $table->unique(['email', 'plan']);
        });
    }

    public function down(): void
    {
        Schema::table('waitlist_entries', function (Blueprint $table) {
            $table->dropUnique(['email', 'plan']);
        });
    }
};
