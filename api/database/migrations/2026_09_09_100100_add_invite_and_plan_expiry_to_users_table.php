<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two columns that arrive together because invites are the first thing to
 * need either.
 *
 * `invite_id` is attribution: which link brought this account in. It also
 * doubles as the "already redeemed one" guard in InviteRedemption, which is
 * why it is a column on the user rather than a pivot — one invite per account
 * is the rule, and a nullable FK states it in the schema. nullOnDelete so
 * removing an invite row never orphans or deletes an account.
 *
 * `plan_expires_at` is the first time a plan has had an end date. Until now
 * "3 months on us" in ProAccessGranted was a promise the code did not keep;
 * an admin had to remember to revoke. Null means the plan is open-ended, which
 * is what every existing row gets. `plans:expire` is the only reader that
 * acts on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('invite_id')->nullable()->after('plan_id')
                ->constrained('invites')->nullOnDelete();
            // Indexed because the expiry command's whole query is a range
            // scan on this column, and almost every row is null.
            $table->timestamp('plan_expires_at')->nullable()->after('invite_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('invite_id');
            $table->dropIndex(['plan_expires_at']);
            $table->dropColumn('plan_expires_at');
        });
    }
};
