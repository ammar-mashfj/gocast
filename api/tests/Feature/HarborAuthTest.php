<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Services\BroadcastTokenService;
use App\Services\IngestMetrics;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;

/**
 * The gate on the ingest port.
 *
 * Two credentials arrive here and the difference matters: the browser studio's
 * 60-second token (every plan, no database read) and a station's long-lived
 * stream key (Pro only, a row and a constant-time compare). Everything below
 * is about keeping them apart and failing closed on every other input.
 *
 * The container fails closed on anything that is not a 200, so a test that
 * asserts 403 is asserting "this broadcaster does not get on air".
 */
function harborAuth(array $payload, array $headers = []): TestResponse
{
    return test()->postJson('/api/internal/harbor-auth', $payload, array_merge([
        'X-Internal-Key' => config('services.internal_api_key'),
    ], $headers));
}

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);

    // updateOrCreate, not create: the plans migration ships real `free` and
    // `pro` rows and the slug is unique.
    $this->pro = Plan::updateOrCreate(
        ['slug' => 'pro'],
        ['name' => 'Pro', 'max_stations' => 5, 'max_listeners' => 1000, 'encoder_enabled' => true],
    );
    $this->free = Plan::updateOrCreate(
        ['slug' => 'free'],
        ['name' => 'Free', 'max_stations' => 1, 'max_listeners' => 100, 'encoder_enabled' => false],
    );

    $this->owner = User::factory()->create(['plan_id' => $this->pro->id]);
    $this->station = Station::factory()->for($this->owner, 'user')->create(['slug' => 'jazz']);
    $this->key = $this->station->stream_key;
});

it('is closed to anything without the internal key', function () {
    harborAuth(['slug' => 'jazz', 'password' => $this->key], ['X-Internal-Key' => 'wrong'])
        ->assertUnauthorized();
});

it('admits the studio with a fresh broadcast token', function () {
    $token = app(BroadcastTokenService::class)->issue($this->owner, $this->station);

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $token])->assertOk();
});

it('admits an encoder with the station stream key', function () {
    // What BUTT and Mixxx send: the literal username `source` and the key as
    // the password, base64'd into Authorization: Basic by libshout.
    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertOk();
});

it('refuses the stream key when the owner is on a plan without the encoder', function () {
    $this->owner->update(['plan_id' => $this->free->id]);

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertForbidden();
});

it('refuses the stream key after the plan has expired and been swept', function () {
    // plans:expire is what actually enforces the expiry — nothing evaluates
    // `plan_expires_at` at read time — so this is the real sequence: a trial
    // runs out, the nightly command downgrades the account, and the encoder
    // stops working at its next reconnect rather than mid-show.
    $this->owner->forceFill(['plan_expires_at' => now()->subDay()])->save();

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertOk();

    $this->artisan('plans:expire')->assertSuccessful();

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertForbidden();
});

it('keeps the browser studio working on a free plan', function () {
    // The encoder is the Pro feature. Going live from the studio is not, and
    // a free account must still be admitted by the token path.
    $this->owner->update(['plan_id' => $this->free->id]);
    $token = app(BroadcastTokenService::class)->issue($this->owner->fresh(), $this->station);

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $token])->assertOk();
});

it('refuses a wrong stream key', function () {
    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => Station::generateStreamKey()])
        ->assertForbidden();
});

it('refuses one station stream key used against another station', function () {
    $other = Station::factory()->for($this->owner, 'user')->create(['slug' => 'blues']);

    // The mount is what picks the container, so this is the shape of the
    // mistake: right credential, wrong mount typed into the encoder.
    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $other->stream_key])
        ->assertForbidden();
});

it('refuses a station with no stream key at all', function () {
    $this->station->forceFill(['stream_key' => null])->save();

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertForbidden();

    // And an empty password must not be treated as matching an empty column.
    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => ''])->assertForbidden();
});

it('refuses an empty credential', function () {
    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => ''])->assertForbidden();
    harborAuth(['slug' => 'jazz', 'user' => 'source'])->assertForbidden();
});

it('refuses an unknown station', function () {
    harborAuth(['slug' => 'nope', 'user' => 'source', 'password' => $this->key])->assertForbidden();
});

it('refuses a soft-deleted station', function () {
    // The container may still be running for a few seconds after a delete —
    // long enough for an encoder to reconnect into it.
    $this->station->delete();

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertForbidden();
});

it('refuses rather than 500s when the database is unreachable', function () {
    // A 500 and a 403 look the same to the broadcaster — the container fails
    // closed either way — but only one of them is a decision.
    //
    // Pointing the default connection at a name that is not configured is the
    // cheapest honest stand-in for a dead database: the resolver throws at
    // query time, exactly where a refused TCP connect would.
    $real = config('database.default');
    config(['database.default' => 'gone']);

    $response = harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key]);

    // Put it back before asserting: RefreshDatabase rolls its transaction back
    // against whatever the default connection is at teardown, so leaving this
    // broken fails the test from the outside with the wrong error.
    config(['database.default' => $real]);

    $response->assertForbidden();
});

it('never writes the credential to the log', function () {
    Log::spy();

    harborAuth(['slug' => 'jazz', 'user' => 'dj', 'address' => '203.0.113.7', 'password' => $this->key.'x'])
        ->assertForbidden();

    Log::shouldHaveReceived('info')->withArgs(function (string $message, array $context) {
        expect($message)->toBe('Harbor auth refused a publisher')
            ->and($context)->toHaveKeys(['station', 'user', 'address', 'method', 'reason'])
            ->and($context['user'])->toBe('dj')
            ->and($context['address'])->toBe('203.0.113.7')
            // The whole point: a long-lived key must not end up somewhere it
            // outlives every rotation.
            ->and(json_encode($context))->not->toContain($this->key);

        return true;
    })->once();
});

it('counts every attempt by outcome and credential', function () {
    // The only visibility there is into a broadcast that never started: a
    // refused encoder leaves no session, no station event and no listener.
    $metrics = app(IngestMetrics::class);
    $before = $metrics->snapshot();

    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertOk();
    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => 'nope'])->assertForbidden();
    harborAuth(['slug' => 'nope', 'user' => 'source', 'password' => $this->key])->assertForbidden();

    $this->owner->update(['plan_id' => $this->free->id]);
    harborAuth(['slug' => 'jazz', 'user' => 'source', 'password' => $this->key])->assertForbidden();

    $after = $metrics->snapshot();

    expect($after['allowed']['key'] - $before['allowed']['key'])->toBe(1)
        ->and($after['refused']['unknown'] - $before['refused']['unknown'])->toBe(1)
        ->and($after['refused']['none'] - $before['refused']['none'])->toBe(1)
        // The refusal that is a billing event rather than a mistake, which is
        // why it gets its own series.
        ->and($after['refused']['plan'] - $before['refused']['plan'])->toBe(1);
});
