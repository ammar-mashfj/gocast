<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A payment's review note now keeps every reason a human should look
 * (a failed grant, then a price difference, then a dispute…), one per
 * line, instead of the latest one replacing the rest.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->text('review_reason')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->string('review_reason', 255)->nullable()->change();
        });
    }
};
