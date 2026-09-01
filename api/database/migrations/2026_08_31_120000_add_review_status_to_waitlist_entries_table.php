<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Turns the request queue from a log into something a reviewer can act on.
 *
 * The table was deliberately stateless until now — an entry was never edited,
 * so the page was safe to leave open and reload. Granting access is precisely
 * what breaks that: once approving a request moves a real account onto a paid
 * plan, "has anyone dealt with this yet" becomes a question the table has to
 * be able to answer, or two admins grant the same person twice.
 *
 * `reviewed_by` is the part worth having. It is the only record of WHO handed
 * out a paid plan — the activity log captures the resulting plan_id change on
 * the user, but not the decision behind it. nullOnDelete so retiring an admin
 * account leaves the decision standing, unattributed, rather than erasing it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('waitlist_entries', function (Blueprint $table) {
            // Indexed because the admin queue's default view is a filter on
            // this column, and it stays selective: pending is the small end
            // of the table on any healthy day.
            $table->string('status', 20)->default('pending')->after('message')->index();
            $table->timestamp('reviewed_at')->nullable()->after('status');
            $table->foreignId('reviewed_by')->nullable()->after('reviewed_at')
                ->constrained('admins')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('waitlist_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['status', 'reviewed_at']);
        });
    }
};
