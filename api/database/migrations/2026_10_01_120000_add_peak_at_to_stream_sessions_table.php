<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a broadcast reached its peak: the minute `peak_listeners` was last
 * raised. Written beside it by SweepListenerSessions::recordPeak, so the two
 * come from the same sample. The Your shows page opens a show to say "peaked
 * at 21:41".
 *
 * Null for broadcasts nobody listened to and for rows from before this
 * shipped. It is the first time the peak was reached, not the last: a later
 * sample equal to the peak doesn't move it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->timestamp('peak_at')->nullable()->after('peak_listeners');
        });
    }

    public function down(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->dropColumn('peak_at');
        });
    }
};
