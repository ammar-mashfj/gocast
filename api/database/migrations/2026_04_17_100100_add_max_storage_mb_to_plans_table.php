<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('max_storage_mb')->default(500)->after('max_listeners');
        });

        DB::table('plans')->where('id', 1)->update(['max_storage_mb' => 500]);
        DB::table('plans')->where('id', 2)->update(['max_storage_mb' => 10000]);
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('max_storage_mb');
        });
    }
};
