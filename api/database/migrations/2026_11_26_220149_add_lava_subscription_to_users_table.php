<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The account's running lava.top monthly subscription: the first charge's
 * contract id and the email it was bought with, which are what lava.top's
 * cancel call takes. Set by the webhook, cleared on cancel. Null = not a
 * subscriber (Pro paid once, by invite, by hand, or Free).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('users', 'lava_subscription_contract_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->uuid('lava_subscription_contract_id')->nullable();
            $table->string('lava_subscription_email')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['lava_subscription_contract_id', 'lava_subscription_email']);
        });
    }
};
