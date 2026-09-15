<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The two things the invite email says that nothing else in the table knows.
 *
 * - `recipient_name` is what the greeting uses: "Hi Rae,". Deliberately not
 *   `label`, which sits right next to it on the form and means the opposite —
 *   label is the admin's private note and is as likely to read "posted in
 *   r/DJs" as anybody's name. Putting that in a greeting is the classic
 *   broken mail merge, so the two stay separate and the email falls back to
 *   "Hi there," rather than guessing.
 * - `personal_note` is the one paragraph that makes cold outreach not cold —
 *   the line about their set, their station, where we found them. It is the
 *   reason this is a per-invite field and not a template constant.
 *
 * Both nullable: an invite that is never emailed needs neither, and an invite
 * to an address with no name still sends.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invites', function (Blueprint $table) {
            $table->string('recipient_name')->nullable()->after('email');
            $table->text('personal_note')->nullable()->after('recipient_name');
        });
    }

    public function down(): void
    {
        Schema::table('invites', function (Blueprint $table) {
            $table->dropColumn(['recipient_name', 'personal_note']);
        });
    }
};
