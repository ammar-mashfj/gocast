<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * Rotating a station's encoder password.
 *
 * The endpoint takes no body on purpose — the server picks the value — so
 * everything worth testing is about who may call it and what it leaves behind.
 */
beforeEach(function () {
    $this->pro = Plan::updateOrCreate(
        ['slug' => 'pro'],
        ['name' => 'Pro', 'max_stations' => 5, 'max_listeners' => 1000, 'encoder_enabled' => true],
    );
    $this->free = Plan::updateOrCreate(
        ['slug' => 'free'],
        ['name' => 'Free', 'max_stations' => 1, 'max_listeners' => 100, 'encoder_enabled' => false],
    );

    config(['liquidsoap.encoder_host' => 'stream.gocast.fm']);

    $this->owner = User::factory()->create(['plan_id' => $this->pro->id]);
    $this->station = Station::factory()->for($this->owner, 'user')->create(['slug' => 'jazz']);
});

it('mints a new key and returns it to the owner', function () {
    $before = $this->station->stream_key;

    $response = actingAs($this->owner)
        ->postJson('/api/stations/jazz/stream-key')
        ->assertOk();

    $after = $this->station->fresh()->stream_key;

    expect($after)->not->toBe($before)
        ->and($after)->toMatch('/^[A-Za-z0-9]{32}$/')
        // The card redisplays it, so the response has to carry the plaintext.
        ->and($response->json('data.encoder.password'))->toBe($after);
});

it('timestamps the rotation', function () {
    expect($this->station->stream_key_rotated_at)->toBeNull();

    actingAs($this->owner)->postJson('/api/stations/jazz/stream-key')->assertOk();

    expect($this->station->fresh()->stream_key_rotated_at)->not->toBeNull();
});

it('refuses a plan without the encoder', function () {
    $this->owner->update(['plan_id' => $this->free->id]);
    $before = $this->station->stream_key;

    actingAs($this->owner)
        ->postJson('/api/stations/jazz/stream-key')
        ->assertForbidden()
        ->assertJsonPath('code', 'encoder_not_available');

    expect($this->station->fresh()->stream_key)->toBe($before);
});

it('refuses somebody else\'s station', function () {
    $stranger = User::factory()->create(['plan_id' => $this->pro->id]);

    actingAs($stranger)->postJson('/api/stations/jazz/stream-key')->assertForbidden();
});

it('refuses an unauthenticated caller', function () {
    $this->postJson('/api/stations/jazz/stream-key')->assertUnauthorized();
});

it('records the rotation on the station timeline without the key in it', function () {
    actingAs($this->owner)->postJson('/api/stations/jazz/stream-key')->assertOk();

    $event = StationEvent::where('station_id', $this->station->id)
        ->where('type', StationEvent::TYPE_STREAM_KEY_ROTATED)
        ->sole();

    expect($event->source)->toBe(StationEvent::SOURCE_OWNER)
        ->and((string) $event->causer_id)->toBe((string) $this->owner->id)
        // Admin monitoring only. A timeline row outlives the credential it
        // would be describing, so it carries none.
        ->and(json_encode($event->properties))->not->toContain($this->station->fresh()->stream_key);
});
