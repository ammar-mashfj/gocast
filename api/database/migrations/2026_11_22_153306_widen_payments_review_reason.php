<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
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
        // Notes longer than the old column are cut, or the change fails.
        DB::table('payments')->whereRaw('CHAR_LENGTH(review_reason) > 255')
            ->update(['review_reason' => DB::raw('LEFT(review_reason, 255)')]);

        Schema::table('payments', function (Blueprint $table) {
            $table->string('review_reason', 255)->nullable()->change();
        });
    }
};
