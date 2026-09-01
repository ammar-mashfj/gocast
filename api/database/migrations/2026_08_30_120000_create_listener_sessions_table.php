<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listener_sessions', function (Blueprint $table) {
            // NOT `stream_sessions`. That table is about a BROADCASTER holding
            // the microphone; this one is about the audience listening to it.
            // The names are one word apart and mean opposite ends of the pipe.

            // The session token itself — what the player is handed and what it
            // presents on every check-in. Random rather than sequential so one
            // listener can't guess another's id and beat on their behalf.
            $table->char('id', 22)->primary();

            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();

            // How this listener is connected. Only 'hls' rows exist today:
            // they are created when the player asks for a token, and Icecast
            // reports a COUNT rather than identities, so there is nobody to
            // open a row for. The column is here because the planned
            // server-side path — serving the HLS manifest through Laravel so
            // non-browser clients also get counted — writes into this same
            // table, and a dashboard written against `transport` today keeps
            // working when it lands.
            $table->enum('transport', ['hls', 'icecast'])->default('hls');

            // Resolved once, at token time, from the request IP. Null whenever
            // the lookup fails, the IP is private, or no geo source is
            // configured — a session with no country is still a session.
            $table->char('country', 2)->nullable();
            $table->string('device', 16)->nullable();
            $table->string('browser', 32)->nullable();

            // Host only, never the full URL: the path of the page someone came
            // from can carry personal data, and "reddit.com" answers the
            // question anyway.
            $table->string('referrer_host')->nullable();

            // Daily-salted SHA-256 of the IP. Enough to count the same person
            // twice in one day, useless for identifying them, and unlinkable
            // across days because the salt rotates at midnight. This is why
            // the table holds no IP addresses and therefore no personal data
            // to serve an erasure request against.
            $table->char('visitor_hash', 64)->nullable();

            $table->timestamp('started_at');

            // Authoritative only for CLOSED sessions. While a session is live
            // its real last-seen time is the score in the Redis sorted set;
            // this column is refreshed in bulk once a minute by the sweep so
            // that a Redis flush can't leave sessions open forever.
            $table->timestamp('last_seen_at');

            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('seconds')->default(0);

            // Every dashboard query is "this station, this window".
            $table->index(['station_id', 'started_at']);

            // The sweep's two questions: which sessions are still open, and
            // which of those have gone quiet.
            $table->index(['ended_at', 'last_seen_at']);

            // The prune walks the table in start order.
            $table->index('started_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listener_sessions');
    }
};
