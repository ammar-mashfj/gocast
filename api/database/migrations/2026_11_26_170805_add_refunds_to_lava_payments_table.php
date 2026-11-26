<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Refunds per charge: lava.top can refund part of a charge, more than once.
 * `refunds` lists each one by lava.top's refund id (so a repeated webhook is
 * recognised), `refunded_usd` is their total (so revenue can subtract it).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded: the local dev database is shared between branches.
        if (Schema::hasColumn('lava_payments', 'refunded_usd')) {
            return;
        }

        Schema::table('lava_payments', function (Blueprint $table) {
            $table->decimal('refunded_usd', 10, 2)->default(0)->after('amount_usd');
            $table->json('refunds')->nullable()->after('refunded_usd');
        });
    }

    public function down(): void
    {
        Schema::table('lava_payments', function (Blueprint $table) {
            $table->dropColumn(['refunded_usd', 'refunds']);
        });
    }
};
