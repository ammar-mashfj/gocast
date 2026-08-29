<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A small, monotonic integer per station, from which its container's fixed
 * address on gocast-network is computed (LiquidsoapSupervisor::containerIp).
 *
 * Why an index and not the address itself. The address is only meaningful
 * inside one subnet on one box; the index is true everywhere. Restoring a
 * production dump into staging — which deploy-native.sh dumps for, and which
 * is a normal thing to do — would otherwise carry production's addresses into
 * an environment whose network may not even contain them. Storing the index
 * means the row supplies the offset, the environment supplies the subnet, and
 * both are correct. It also makes widening or relocating the subnet a config
 * change rather than a data migration run against live stations.
 *
 * Why it is never reused. Releasing an index on delete looks tidy and is a
 * trap: this model soft-deletes, so a released index is handed to a new
 * station while the old row still exists and can be restored onto it. Worse,
 * an address freed while its container somehow outlived the row — a failed
 * `docker rm`, a daemon restart mid-teardown — is handed to a station that
 * then either cannot start or, silently, is polled at an address answering
 * for somebody else. Monotonic allocation has none of those failure modes and
 * no release path to get wrong. The cost is a ceiling of one address per
 * station ever created (~65k on a /16), which is far off and, because this is
 * an offset rather than an address, is raised by widening the subnet without
 * moving a single existing station.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            // Nullable for the moment: existing rows need values before the
            // column can be made mandatory.
            $table->unsignedInteger('container_index')->nullable()->after('id');
        });

        // Backfill in creation order, including trashed rows — a soft-deleted
        // station can be restored, and it must come back to an address that is
        // still its own.
        $index = 0;

        DB::table('stations')
            ->select('id')
            ->orderBy('created_at')
            ->orderBy('id')
            ->each(function (object $station) use (&$index): void {
                DB::table('stations')
                    ->where('id', $station->id)
                    ->update(['container_index' => ++$index]);
            });

        Schema::table('stations', function (Blueprint $table) {
            $table->unsignedInteger('container_index')->nullable(false)->change();
            $table->unique('container_index');
        });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropUnique(['container_index']);
            $table->dropColumn('container_index');
        });
    }
};
