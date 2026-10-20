<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who pressed "Notify me" under "Card payments are coming soon" in the Get
 * Pro dialog. One row per account; the email is copied so the list survives
 * an address change and can be exported as it is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_payment_interests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('email');
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_payment_interests');
    }
};
