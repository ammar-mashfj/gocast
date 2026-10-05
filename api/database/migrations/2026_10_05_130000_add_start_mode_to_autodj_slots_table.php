<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How a slot begins.
 *
 *   soft — after the song playing at its start time finishes (what every
 *          slot did before this column existed, so it is the default);
 *   hard — exactly on time: the song that would run past the start is
 *          picked to fit, or faded out on the start time.
 *
 * Read by AutoDjScheduler at every track boundary; see
 * docs/JINGLES-AND-HARD-SLOTS-PLAN.md, step 1.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('autodj_slots', function (Blueprint $table) {
            $table->string('start_mode', 8)->default('soft')->after('end_time');
        });
    }

    public function down(): void
    {
        Schema::table('autodj_slots', function (Blueprint $table) {
            $table->dropColumn('start_mode');
        });
    }
};
