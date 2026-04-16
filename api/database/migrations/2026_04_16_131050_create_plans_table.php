<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 30)->unique();
            $table->string('name', 50);
            $table->unsignedInteger('max_stations')->default(1);
            $table->unsignedInteger('max_listeners')->default(25);
            $table->timestamps();
        });

        DB::table('plans')->insert([
            ['id' => 1, 'slug' => 'free', 'name' => 'Free', 'max_stations' => 1, 'max_listeners' => 25, 'created_at' => now(), 'updated_at' => now()],
            ['id' => 2, 'slug' => 'pro', 'name' => 'Pro', 'max_stations' => 5, 'max_listeners' => 500, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('plans');
    }
};
