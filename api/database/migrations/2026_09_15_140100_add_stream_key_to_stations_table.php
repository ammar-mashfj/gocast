<?php

use App\Models\Station;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The long-lived password an external encoder authenticates with.
 *
 * Distinct from `icecast_password` two columns over, which is the credential
 * the station's own Liquidsoap uses to push its OUTPUT to Icecast. This one is
 * the INPUT side: what a human types into BUTT or Mixxx to publish audio into
 * the station's harbor.
 *
 * ENCRYPTED, NOT HASHED — deliberately, and the trade is worth naming.
 *
 * A hash would be the reflex for a credential, and it is the right call for a
 * password a person chooses and remembers. Nobody remembers this one: it is 32
 * random characters that lives in an encoder's settings dialog, and the
 * settings card has to be able to redisplay it months later when they set up a
 * second machine. A show-once secret here buys a marginally smaller blast
 * radius and guarantees a support ticket per user.
 *
 * The cost of `encrypted` is APP_KEY: rotate it and every existing key becomes
 * undecryptable — the same warning BroadcastTokenService already carries for
 * its MACs. The recovery path is the rotation endpoint, which mints a new key
 * without needing to read the old one, so a rotated APP_KEY costs every
 * broadcaster a re-paste rather than costing anyone their station.
 *
 * Charset is restricted to [A-Za-z0-9] in Station::generateStreamKey(). This
 * value travels through `Authorization: Basic` and, on the metadata request,
 * through a URL query string; encoder UIs disagree about escaping punctuation
 * and the failure mode is an auth refusal nobody can explain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            // text, not string: Laravel's `encrypted` cast stores a
            // base64 JSON envelope (iv + value + mac), so a 32-character
            // secret lands as roughly 250 bytes of ciphertext.
            $table->text('stream_key')->nullable()->after('icecast_password');
            $table->timestamp('stream_key_rotated_at')->nullable()->after('stream_key');
        });

        // Backfill, so every station that already exists behaves like one
        // created after this migration — the settings card reads the column
        // directly and a null would render an empty password field.
        //
        // Chunked and written one row at a time because the value has to go
        // through the model's `encrypted` cast; a bulk UPDATE would store
        // plaintext that the cast then fails to decrypt on read.
        Station::withTrashed()
            ->whereNull('stream_key')
            ->select(['id'])
            ->chunkById(200, function ($stations) {
                foreach ($stations as $station) {
                    // saveQuietly() silences the events; it does NOT stop
                    // Eloquent touching `updated_at`. Without this the backfill
                    // stamps every station on the box — soft-deleted ones
                    // included, since this reads withTrashed() — with the
                    // deploy time, and anything treating that column as "when
                    // the owner last changed something" (ordering, cache keys,
                    // sitemap lastmod) reports the whole catalogue as edited at
                    // once. Nobody edited anything; we gave them a key.
                    $station->timestamps = false;

                    $station->forceFill([
                        'stream_key' => Station::generateStreamKey(),
                    ])->saveQuietly();
                }
            });
    }

    public function down(): void
    {
        Schema::table('stations', function (Blueprint $table) {
            $table->dropColumn(['stream_key', 'stream_key_rotated_at']);
        });
    }
};
