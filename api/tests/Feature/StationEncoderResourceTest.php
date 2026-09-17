<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * Who sees the encoder connection details — and, more to the point, who does
 * not. The block carries a live credential, so every gate on it is load-bearing
 * even though none of them is the gate that actually refuses a broadcast
 * (HarborAuthController is).
 */
beforeEach(function () {
    config([
        'liquidsoap.encoder_host' => 'stream.gocast.fm',
        'liquidsoap.encoder_port' => 8010,
    ]);

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
});

it('gives a Pro owner everything an encoder asks for', function () {
    actingAs($this->owner)
        ->getJson('/api/stations/jazz')
        ->assertOk()
        ->assertJsonPath('data.encoder.host', 'stream.gocast.fm')
        ->assertJsonPath('data.encoder.port', 8010)
        ->assertJsonPath('data.encoder.mount', '/jazz')
        ->assertJsonPath('data.encoder.username', 'source')
        ->assertJsonPath('data.encoder.password', $this->station->stream_key);
});

/**
 * The owner's own station LIST does not carry the credential, even though
 * every gate on it would pass.
 *
 * The dashboard fetches this list on more or less every page it renders, and
 * the card that needs a stream key lives on exactly one of them. Shipping a
 * long-lived plaintext credential for every station the account owns on all
 * the others buys nothing and puts it through a Next.js server fetch, any
 * response cache and any request log in between. StationResource composes the
 * block only when a controller asks — see StationResource::$withEncoder.
 */
it('keeps the key out of the station list, which nothing there can use', function () {
    Station::factory()->for($this->owner, 'user')->create(['slug' => 'blues']);

    $response = actingAs($this->owner)->getJson('/api/stations')->assertOk();

    expect($response->getContent())->not->toContain($this->station->stream_key);
    $response->assertJsonMissingPath('data.0.encoder')
        ->assertJsonMissingPath('data.1.encoder');
});

it('omits it for an owner on a plan without the encoder', function () {
    $this->owner->update(['plan_id' => $this->free->id]);

    actingAs($this->owner)
        ->getJson('/api/stations/jazz')
        ->assertOk()
        ->assertJsonMissingPath('data.encoder');
});

it('omits it when no ingest router is configured', function () {
    // A deployment without the router published would otherwise print a
    // hostname that resolves to nothing, which reads as a broken feature
    // rather than an absent one.
    config(['liquidsoap.encoder_host' => null]);

    actingAs($this->owner)
        ->getJson('/api/stations/jazz')
        ->assertOk()
        ->assertJsonMissingPath('data.encoder');
});

it('never leaks the key through the public station endpoint', function () {
    $this->station->update(['desired_state' => Station::STATE_RUNNING]);

    $response = $this->getJson('/api/public/stations/jazz');

    expect($response->getContent())->not->toContain($this->station->stream_key);
    $response->assertJsonMissingPath('data.encoder');
});

it('never leaks one owner\'s key to another account', function () {
    $stranger = User::factory()->create(['plan_id' => $this->pro->id]);

    // The station show endpoint is owner-scoped, so the reachable surface is
    // the directory listing — which renders the same resource.
    $this->station->update(['desired_state' => Station::STATE_RUNNING]);

    $response = actingAs($stranger)->getJson('/api/public/stations');

    expect($response->getContent())->not->toContain($this->station->stream_key);
});
