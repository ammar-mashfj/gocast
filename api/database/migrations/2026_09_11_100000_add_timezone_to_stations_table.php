<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The clock a station's advertised show times are written in.
 *
 * An IANA name ("Europe/Madrid"), never a UTC offset: an offset is only
 * correct until the next DST change, at which point every advertised time
 * silently moves by an hour. The zone name survives the transition because it
 * describes the rule, not one of its outcomes.
 *
 * Nullable rather than defaulted to UTC. A default would be a claim nobody
 * made — a DJ in Madrid who never opens the picker would publish times that
 * are wrong by two hours all summer, and neither side would know. Null means
 * "not chosen", and StationScheduleController refuses to store show times
 * until it is.
 *
 * Deliberately NOT added to StationObserver's LIQ_RELEVANT_COLUMNS: this value
 * never reaches the .liq, so changing it must not restart a container and
 * disconnect an audience.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->string('timezone', 64)->nullable()->after('genre');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn('timezone');
        });
    }
};
