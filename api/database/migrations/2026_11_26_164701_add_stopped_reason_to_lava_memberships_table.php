<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Why we stopped a membership ourselves (a refund or chargeback of one of its
 * charges). A renewal that still lands afterwards is held for review instead
 * of granting Pro again.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded: the local dev database is shared between branches.
        if (Schema::hasColumn('lava_memberships', 'stopped_reason')) {
            return;
        }

        Schema::table('lava_memberships', function (Blueprint $table) {
            $table->string('stopped_reason', 255)->nullable()->after('ends_at');
        });
    }

    public function down(): void
    {
        Schema::table('lava_memberships', function (Blueprint $table) {
            $table->dropColumn('stopped_reason');
        });
    }
};
