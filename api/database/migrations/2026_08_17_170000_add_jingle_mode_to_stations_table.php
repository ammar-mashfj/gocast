<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            // How jingles are spaced. Two genuinely different answers, and
            // which one is right depends on content the platform cannot see:
            //
            //   interval — "every 30 minutes". Predictable in wall-clock
            //              terms (legal IDs, sponsor reads) and unaffected by
            //              track length, but the real gap drifts past the
            //              setting on a station playing long mixes, because
            //              the jingle still waits for a track boundary.
            //   tracks   — "every 5 tracks". Even musical density, which is
            //              what the owner hears, at the cost of real-world
            //              spacing that swings with track length.
            //
            // Defaulting to interval keeps every station created before this
            // migration behaving exactly as it did.
            $table->string('jingle_mode', 16)->default('interval');

            // Only consulted in `tracks` mode. Kept alongside the interval
            // rather than replacing it so switching modes back and forth
            // doesn't lose the other mode's setting.
            $table->unsignedInteger('jingle_every_tracks')->default(5);
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['jingle_mode', 'jingle_every_tracks']);
        });
    }
};
