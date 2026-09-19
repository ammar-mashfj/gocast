<?php

use App\Models\User;
use Illuminate\Testing\TestResponse;

/**
 * `/broadcasting/auth` — the endpoint that signs a private channel
 * subscription.
 *
 * This file exists for one reason: the route is registered OUTSIDE the api
 * route group, and our browser auth is a `token` cookie that only becomes a
 * bearer header because UseAuthTokenCookie is prepended to that group. On the
 * default (web) stack the cookie never converts, Sanctum sees a guest, and
 * every private subscription 401s — while every ordinary API call keeps
 * working, which is what makes it read as a broadcasting problem instead of a
 * middleware one.
 *
 * It is also the regression most likely to pass unnoticed: nothing else in
 * the suite exercises this path, and the symptom on a dashboard is simply
 * that realtime silently stops and polling carries on.
 */
beforeEach(function () {
    // The `log` broadcaster's auth() is a no-op — it never runs the channel
    // callback at all, so authorization asserted against it would pass for
    // anybody. `pusher` signs with a local HMAC and makes no network call, so
    // dummy credentials exercise the real path entirely offline.
    config([
        'broadcasting.default' => 'pusher',
        'broadcasting.connections.pusher.key' => 'test-key',
        'broadcasting.connections.pusher.secret' => 'test-secret',
        'broadcasting.connections.pusher.app_id' => 'test-app-id',
    ]);

    // Channel definitions live on the BROADCASTER, not on the manager:
    // `Broadcast::channel()` has no method on BroadcastManager and reaches the
    // driver through __call. bootstrap/app.php loads routes/channels.php once
    // at boot, when the default connection is still `log`, so switching the
    // default above leaves the new pusher driver with no channels at all —
    // and every subscription 403s for a reason that has nothing to do with
    // the thing under test. Re-loading the real file is what puts them there.
    require base_path('routes/channels.php');

    $this->user = User::factory()->create();
});

/** What a browser actually sends: the HttpOnly `token` cookie, no header. */
function authorizeWithCookie(User $user, string $channel): TestResponse
{
    $token = $user->createToken('realtime-test')->plainTextToken;

    return test()
        // The raw Cookie header, not withCookie(): UseAuthTokenCookie parses
        // that header itself rather than using $request->cookie(), because
        // cookie() collapses duplicates and keeps the first — the wrong one
        // when a stale token shadows the current session.
        ->withHeader('Cookie', 'token='.$token)
        ->postJson('/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => $channel,
        ]);
}

it('authorizes an owner for their own channel using the token cookie', function () {
    authorizeWithCookie($this->user, 'private-user.'.$this->user->id)
        ->assertOk()
        ->assertJsonStructure(['auth']);
});

it('refuses one user the channel of another', function () {
    $someoneElse = User::factory()->create();

    authorizeWithCookie($this->user, 'private-user.'.$someoneElse->id)
        ->assertForbidden();
});

it('refuses a guest', function () {
    $this->postJson('/broadcasting/auth', [
        'socket_id' => '1234.5678',
        'channel_name' => 'private-user.'.$this->user->id,
    ])->assertUnauthorized();
});

it('still accepts a bearer header, for anything that is not a browser', function () {
    $token = $this->user->createToken('realtime-test')->plainTextToken;

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson('/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => 'private-user.'.$this->user->id,
        ])
        ->assertOk();
});

it('answers a cross-origin preflight', function () {
    // The other half of the same trap. cors.php lists `api/*`, and
    // `broadcasting/auth` is a SIBLING of that path rather than a child, so
    // the wildcard does not reach it. Omitted, the browser's preflight fails
    // and the error it prints says CORS — which sends whoever is debugging it
    // looking at the server config instead of at one missing list entry.
    config(['cors.allowed_origins' => ['http://localhost:3000']]);

    $this->call('OPTIONS', '/broadcasting/auth', server: [
        'HTTP_ORIGIN' => 'http://localhost:3000',
        'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
    ])
        ->assertNoContent()
        ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
        // Without credentials the `token` cookie never rides along, and the
        // request above authenticates as nobody.
        ->assertHeader('Access-Control-Allow-Credentials', 'true');
});
