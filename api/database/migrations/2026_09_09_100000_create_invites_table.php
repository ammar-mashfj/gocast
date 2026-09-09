<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Invitation codes: a plan grant that travels by link.
 *
 * The third way onto a paid plan, and the first that does not need an admin
 * in the loop per person. The other two (AccessRequestController's approve,
 * AccountController's hand-provisioning) both assume the admin acts on a
 * known account. Outreach is the opposite shape: the admin knows an email
 * and nothing else, and wants to hand the recipient something they can act on
 * themselves, days later, without another round trip.
 *
 * Design notes, in the order people ask about them:
 *
 * - `code` is random and long enough not to be guessed (see Invite::generateCode),
 *   because the link IS the entitlement. There is no email binding on purpose:
 *   links get forwarded, and a mismatch check would only create support work.
 *   `max_uses` is what bounds abuse, not the address.
 * - `uses` is a counter rather than a boolean so one shared code can go in a
 *   social post later without a second feature. Who actually redeemed one is
 *   recorded on `users.invite_id`, which is where attribution lives.
 * - `duration_days` is what the redeemed plan lasts. Null means no end date,
 *   which is the honest setting while there is no checkout for the plan to
 *   convert into. When set, it becomes `users.plan_expires_at` at redemption
 *   and `plans:expire` enforces it.
 * - `expires_at` is about the LINK, not the plan: after this the code stops
 *   redeeming. Separate columns because "this offer is open until Friday" and
 *   "you get Pro for 90 days" are different promises.
 * - `created_by` is nullOnDelete for the same reason as
 *   `waitlist_entries.reviewed_by`: retiring an admin must not erase the
 *   record of who handed out a paid plan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invites', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->foreignId('plan_id')->constrained();
            $table->unsignedInteger('duration_days')->nullable();
            $table->string('label')->nullable();
            $table->unsignedInteger('max_uses')->default(1);
            $table->unsignedInteger('uses')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('admins')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invites');
    }
};
