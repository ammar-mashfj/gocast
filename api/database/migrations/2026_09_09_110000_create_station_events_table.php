<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('station_events', function (Blueprint $table) {
            // Auto-incrementing rather than a UUID, unlike most tables here.
            // This is an append-only log written by machines: ids are never
            // exposed, never guessed at, and never arrive from a client, so
            // the only thing that matters is that inserts land at the end of
            // the index instead of scattering across it.
            $table->id();

            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();

            $table->string('type', 32);

            // Who or what produced this: 'container', 'owner', 'admin' or
            // 'system'. Kept as a separate column rather than inferred from
            // `type`, because the same transition can arrive from several
            // directions — a station stops because its owner pressed the
            // button, or because the sweep found nothing to broadcast, and
            // telling those apart is most of why this table exists.
            $table->string('source', 16);

            // Stringly typed like activity_log's, and for the same reason: a
            // causer is a User (integer key) or an Admin, and most rows have
            // no causer at all because a container is not a person. No
            // foreign key — the log outlives the account.
            $table->string('causer_type')->nullable();
            $table->string('causer_id')->nullable();

            // Event-specific detail: the track title for an upload, the reason
            // string for a stop, the error text for icecast_error. Anything
            // that would otherwise become a column nothing else reads.
            $table->json('properties')->nullable();

            // created_at only. An event happened once; there is no version of
            // this row that gets updated later, and a nullable updated_at that
            // is always equal to created_at is a column that invites somebody
            // to write to it.
            $table->timestamp('created_at')->nullable();

            // The only access pattern: one station's timeline, newest first.
            $table->index(['station_id', 'created_at']);

            // Retention scans the whole table by age, ignoring the station.
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('station_events');
    }
};
