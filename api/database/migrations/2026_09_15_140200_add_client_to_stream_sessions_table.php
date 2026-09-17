<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which software was on the other end of this broadcast.
 *
 * `source_type` beside it already answers the coarse question — studio,
 * desktop, or external encoder — and that is what the UI renders. This is the
 * fine-grained one: "Mixxx 2.5.0", "libshout/2.4.6", a browser user-agent.
 *
 * It exists for support. "It won't connect" and "it drops every twenty
 * minutes" are both questions whose first useful answer is which client and
 * which version, and asking the person to go and look is a round trip that
 * costs a day. Harbor already has it — it is in the connect headers — so the
 * only cost is a column.
 *
 * Nullable forever, and nothing may branch on it:
 *   • the browser studio's own session row (StreamSessionController::store)
 *     is written from an API call that carries no user-agent we want,
 *   • a container rendered before the template started reporting it sends
 *     nothing, and those keep running until `stations:relaunch`.
 *
 * ALLOWLISTED AT THE SOURCE. The .liq reads three header names by their labels
 * and never forwards the list, because that list also holds
 * `authorization: Basic <base64 of source:streamkey>`. This column must never
 * become a reason to relax that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->string('client')->nullable()->after('source_type');
        });
    }

    public function down(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->dropColumn('client');
        });
    }
};
