<?php

use App\Console\Commands\PruneNotifications;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index the column the retention sweep filters on.
 *
 * The stock Laravel notifications table indexes the uuid primary key and
 * `morphs('notifiable')`, which covers every read the bell performs — the feed
 * and the unread count are both one user's rows. Nothing covered
 * `created_at`, and until PruneNotifications shipped nothing needed to.
 *
 * It needs it now, and the chunking makes the need worse rather than better:
 * `delete ... where created_at < ? limit 1000` scans from the start of the
 * table every time, so an unindexed prune of a large backlog is one full scan
 * PER CHUNK. That is the exact case the chunk loop exists for, so without this
 * index the loop costs more than the single statement it replaced.
 *
 * @see PruneNotifications
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
        });
    }
};
