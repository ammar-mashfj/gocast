<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets an invite carry the address it was meant for, and remember that it was
 * sent there.
 *
 * Until now the admin page minted a link and stopped: the sending was a copy,
 * a switch to a mail client, and a paste. That is fine for the first few and
 * wrong for the tenth, and it loses the one fact the table most wants to show
 * next to `uses` — who was actually asked.
 *
 * - `email` is who the link was last sent to, NOT a binding. Redemption still
 *   ignores it entirely (see the create_invites_table notes on why links get
 *   forwarded and why `max_uses` is the real bound). It exists so the page can
 *   say "sent to rae@example.com, not redeemed" rather than "not redeemed",
 *   and so resending does not mean retyping the address.
 * - `sent_at` is the last send, not the first: a resend overwrites it. What
 *   the admin needs to know is whether the current link is out there and how
 *   stale that ask is; the full history of every send is in the activity log,
 *   which is where a question about the second send belongs.
 *
 * Both nullable, because a code minted for a social post has no address and is
 * never sent by us — that path is untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invites', function (Blueprint $table) {
            $table->string('email')->nullable()->after('label');
            $table->timestamp('sent_at')->nullable()->after('expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('invites', function (Blueprint $table) {
            $table->dropColumn(['email', 'sent_at']);
        });
    }
};
