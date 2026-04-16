<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('plan_id')->default(1)->after('avatar_url')->constrained();
        });

        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['plan', 'stripe_customer_id', 'stripe_subscription_id']);
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->enum('plan', ['free', 'starter', 'pro', 'studio'])->default('free')->after('artwork_url');
            $table->string('stripe_customer_id')->nullable();
            $table->string('stripe_subscription_id')->nullable();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('plan_id');
        });
    }
};
