<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The rotation state now lives on `playlists` (see the backfill migration
 * before this one). Nothing reads these columns any more.
 *
 * Separate from the backfill on purpose: rolling back stops here first,
 * restoring the columns, so the backfill's own `down()` can copy the state
 * back into them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['autodj_cursor_position', 'autodj_order', 'autodj_deck']);
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->unsignedInteger('autodj_cursor_position')->nullable()->after('desired_state');
            $table->string('autodj_order', 16)->default('sequential')->after('autodj_cursor_position');
            $table->json('autodj_deck')->nullable()->after('autodj_order');
        });
    }
};
