<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per lava.top charge we were told about: the first payment of the
 * monthly subscription, each renewal, and each pay-once purchase. The unique
 * contract id is what makes lava.top's retries count once.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lava_sales')) {
            return;
        }

        Schema::create('lava_sales', function (Blueprint $table) {
            $table->id();
            $table->uuid('contract_id')->unique();
            $table->string('event_type', 64);
            $table->uuid('product_id')->nullable();
            $table->string('email')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('amount', 12, 2)->nullable();
            $table->string('currency', 8)->nullable();
            $table->unsignedTinyInteger('months')->nullable();
            $table->timestamp('granted_until')->nullable();
            $table->string('review_reason', 500)->nullable();
            $table->json('payload');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lava_sales');
    }
};
