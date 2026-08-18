<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            // What role this file plays in the audio graph.
            //
            //   music  — the AutoDJ rotation, played top-to-bottom on loop.
            //   jingle — station IDs, liners, sweepers. NOT part of the
            //            rotation: Liquidsoap holds them behind a `delay`
            //            and slips one in at the next track boundary once
            //            the station's jingle interval has elapsed.
            //
            // Defaulting to 'music' is what makes this migration a no-op for
            // every existing library.
            $table->string('kind', 16)->default('music')->after('station_id');

            // `position` is gap-free per (station, kind) — the two lists are
            // ordered independently — so every read is scoped by kind and
            // wants it in the index.
            $table->index(['station_id', 'kind', 'position']);
        });
    }

    public function down(): void
    {
        Schema::table('tracks', function (Blueprint $table) {
            $table->dropIndex(['station_id', 'kind', 'position']);
            $table->dropColumn('kind');
        });
    }
};
