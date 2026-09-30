<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a broadcast came from: the broadcaster's IP and its country.
 *
 * Admin support only, beside `client`. Neither comes from harbor. The web
 * studio and the app reach harbor through proxies, so harbor sees a proxy
 * address. Both are taken from the POST /auth/broadcast-token request that
 * comes right before every studio or app connection. That is an ordinary API
 * call, so trusted proxies resolve the real IP and Cloudflare sets the country.
 * See BroadcastOrigin.
 *
 * Null for encoder broadcasts (no token request, and the TCP router hides the
 * address), for rows opened before this shipped, and whenever the cached
 * origin expired before harbor connected. Nothing may branch on either column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->string('ip_address', 45)->nullable()->after('client');
            $table->char('country', 2)->nullable()->after('ip_address');
        });
    }

    public function down(): void
    {
        Schema::table('stream_sessions', function (Blueprint $table) {
            $table->dropColumn(['ip_address', 'country']);
        });
    }
};
