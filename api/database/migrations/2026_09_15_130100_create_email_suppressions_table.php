<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Addresses that asked us to stop writing to them.
 *
 * Exists because invites are cold outreach and Resend does not cover this.
 * Resend suppresses hard bounces and spam complaints on its own, which is a
 * different list answering a different question ("can this address receive
 * mail?"). Nothing in an ordinary transactional send adds an unsubscribe link
 * or remembers an opt-out — that is a Broadcasts feature, and a Broadcast
 * cannot carry a per-recipient invite link. So the opt-out is ours to keep.
 *
 * WHAT IT GOVERNS is outreach, not the account's own mail. Someone who
 * unsubscribes from an invite and later signs up anyway still gets their
 * verification code and their password resets — those are things they asked
 * for, and suppressing them would lock them out of a product they chose to
 * join. InviteController is the only reader today, and any future outreach
 * (a second invite wave) belongs here too.
 *
 * `email` is the key and it is unique: unsubscribing twice is the same fact,
 * and the second POST from a mail client prefetching the link must not fail.
 * `invite_id` is nullOnDelete for the usual reason — the record of someone
 * having said no must outlive whatever we sent them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_suppressions', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->string('reason')->default('unsubscribed');
            $table->foreignId('invite_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_suppressions');
    }
};
