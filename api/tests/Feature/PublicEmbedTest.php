<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The embed gate is on the URL, not on the snippet. Every refusal here is a
 * 404 on the payload the embed page renders from, which is what stops a free
 * owner getting an embed by typing the address in by hand.
 */
beforeEach(function () {
    config(['liquidsoap.hls_base_url' => 'https://stream.gocast.fm']);

    // updateOrCreate, not create: the plans migration ships real `free` and
    // `pro` rows, and the slug is unique.
    $this->pro = Plan::updateOrCreate(
        ['slug' => 'pro'],
        ['name' => 'Pro', 'max_stations' => 5, 'max_listeners' => 1000, 'embed_enabled' => true],
    );
    $this->free = Plan::updateOrCreate(
        ['slug' => 'free'],
        ['name' => 'Free', 'max_stations' => 1, 'max_listeners' => 100, 'embed_enabled' => false],
    );
});

it('serves the station payload for a Pro owner', function () {
    $owner = User::factory()->create(['plan_id' => $this->pro->id]);
    $station = Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);

    $this->getJson('/api/public/stations/jazz/embed')
        ->assertOk()
        ->assertJsonPath('data.slug', 'jazz')
        ->assertJsonPath('data.name', $station->name)
        // The embed plays from the same URLs as the station page.
        ->assertJsonPath('data.hls_url', 'https://stream.gocast.fm/jazz/aac.m3u8')
        ->assertJsonPath('data.icecast_mount', $station->icecast_mount)
        // Owner-only on the public resource, and this is an anonymous request.
        ->assertJsonMissingPath('data.watermarked');
});

it('answers 404 for a free owner, indistinguishable from an unknown slug', function () {
    $owner = User::factory()->create(['plan_id' => $this->free->id]);
    Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);

    $free = $this->getJson('/api/public/stations/jazz/embed')->assertNotFound();
    $missing = $this->getJson('/api/public/stations/nope/embed')->assertNotFound();

    // Same message, so a stranger cannot tell "exists but free" from "does
    // not exist" — the whole point of refusing with 404 rather than 403.
    // (Only the message: under APP_DEBUG the body also carries a trace.)
    expect($free->json('message'))->toBe($missing->json('message'));
});

it('goes dark the moment the owner is downgraded', function () {
    $owner = User::factory()->create(['plan_id' => $this->pro->id]);
    Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);

    $this->getJson('/api/public/stations/jazz/embed')->assertOk();

    $owner->update(['plan_id' => $this->free->id]);

    // Decided behaviour: an embed pasted on someone else's site stops
    // rendering with the downgrade, not at the end of some grace period.
    $this->getJson('/api/public/stations/jazz/embed')->assertNotFound();
});

it('still plays through the public station endpoint regardless of plan', function () {
    // The audio and the station page were never gated and must not become
    // so as a side effect — only the framed player is Pro.
    $owner = User::factory()->create(['plan_id' => $this->free->id]);
    Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);

    $this->getJson('/api/public/stations/jazz')
        ->assertOk()
        ->assertJsonPath('data.hls_url', 'https://stream.gocast.fm/jazz/aac.m3u8');
});

it('tells the dashboard whether the account may embed', function () {
    $pro = User::factory()->create(['plan_id' => $this->pro->id]);
    $free = User::factory()->create(['plan_id' => $this->free->id]);

    actingAs($pro)->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('data.plan.embed_enabled', true);

    actingAs($free)->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('data.plan.embed_enabled', false);
});

it('grants embed to the shipped pro row and withholds it from free', function () {
    // The migration's data step, checked against the real rows rather than
    // the updateOrCreate above — which is why this test re-reads from the DB
    // without touching embed_enabled first.
    Plan::query()->whereIn('slug', ['free', 'pro'])->delete();
    $this->artisan('migrate:fresh');

    expect(Plan::where('slug', 'pro')->value('embed_enabled'))->toBeTrue()
        ->and(Plan::where('slug', 'free')->value('embed_enabled'))->toBeFalse();
});
