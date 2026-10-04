<?php

use App\Models\Station;
use App\Models\User;
use Illuminate\Testing\TestResponse;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\call;

/**
 * The go-live connection check's upload target. The client does the timing;
 * the endpoint only has to swallow the body, cap it, and stay behind auth.
 */
function probe(string $body): TestResponse
{
    return call('POST', '/api/broadcast/uplink-probe', [], [], [], [
        'CONTENT_TYPE' => 'application/octet-stream',
        'HTTP_ACCEPT' => 'application/json',
    ], $body);
}

it('reports how many bytes arrived', function () {
    actingAs(User::factory()->create());

    probe(random_bytes(96 * 1024))->assertOk()->assertJson(['bytes' => 96 * 1024]);
    probe('')->assertOk()->assertJson(['bytes' => 0]);
});

it('refuses a body far bigger than a probe', function () {
    actingAs(User::factory()->create());

    probe(str_repeat('x', 300 * 1024))->assertStatus(413);
});

it('needs a signed-in user', function () {
    probe('x')->assertUnauthorized();
});

it('keeps its own rate limit, apart from the other throttled routes', function () {
    $owner = User::factory()->create();
    Station::factory()->for($owner, 'user')->create(['slug' => 'jazz']);
    actingAs($owner);

    // A full minute's worth of check reports...
    for ($i = 0; $i < 20; $i++) {
        $this->postJson('/api/stations/jazz/uplink-checks', ['outcome' => 'ok', 'kbps' => 900, 'bitrate' => 128])->assertOk();
    }
    $this->postJson('/api/stations/jazz/uplink-checks', ['outcome' => 'ok', 'kbps' => 900, 'bitrate' => 128])->assertTooManyRequests();

    // ...leaves the probe's own budget untouched.
    probe('')->assertOk();
});
