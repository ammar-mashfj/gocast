<?php

use App\Events\StationStateChanged;
use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Redis;
use Illuminate\Testing\TestResponse;

use function Pest\Laravel\postJson;
use function Pest\Laravel\withHeaders;

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);
});

it('rejects requests without the internal key', function () {
    postJson('/api/internal/now-playing', [
        'slug' => 'jazz',
        'title' => 'Song',
    ])->assertUnauthorized();
});

it('rejects slugs containing uppercase', function () {
    Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/now-playing', [
            'slug' => 'Jazz',
            'title' => 'Song',
        ])
        ->assertUnprocessable();
});

it('stores the now-playing payload in redis for a valid push', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    // The controller asks whether the station was already saying something
    // before it writes, so it can announce a silence→audio transition. These
    // two tests are about the WRITE, so the answer does not matter.
    Redis::shouldReceive('exists')->andReturn(0);

    Redis::shouldReceive('setex')
        ->once()
        ->with("metadata:{$station->id}", 6 * 3600, Mockery::on(function (string $payload) {
            $data = json_decode($payload, true);

            return is_array($data) && $data['title'] === 'Song' && $data['artist'] === 'Artist';
        }))
        ->andReturnTrue();

    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/now-playing', [
            'slug' => 'jazz',
            'title' => 'Song',
            'artist' => 'Artist',
        ])
        ->assertOk()
        ->assertJson(['ok' => true]);
});

it('clears the redis key when title and artist are both empty', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    Redis::shouldReceive('exists')->andReturn(0);

    Redis::shouldReceive('del')
        ->once()
        ->with("metadata:{$station->id}")
        ->andReturn(1);

    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/now-playing', [
            'slug' => 'jazz',
            'title' => '',
            'artist' => '',
        ])
        ->assertOk()
        ->assertJson(['ok' => true, 'cleared' => true]);
});

it('returns 404 for unknown slugs', function () {
    withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->postJson('/api/internal/now-playing', [
            'slug' => 'no-such-station',
            'title' => 'Song',
        ])
        ->assertNotFound();
});

describe('audio start/stop signalling', function () {
    beforeEach(function () {
        $this->station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'quiet']);
        Redis::del("metadata:{$this->station->id}");
        Event::fake([StationStateChanged::class]);
    });

    /** @param array<string, mixed> $payload */
    function pushMetadata(array $payload): TestResponse
    {
        return withHeaders(['X-Internal-Key' => 'test-internal-key'])
            ->postJson('/api/internal/now-playing', $payload);
    }

    it('announces the first audio after silence', function () {
        // The case this exists for. A station sitting on the silence bed has
        // no `remaining`, so the dashboard's track-aware poll has nothing to
        // time its next read against — the card would keep saying "Silence —
        // add tracks or go live" for a full interval after the owner added
        // tracks and the station started playing them.
        pushMetadata(['slug' => 'quiet', 'title' => 'First Track'])->assertOk();

        Event::assertDispatched(
            StationStateChanged::class,
            fn (StationStateChanged $e) => $e->slug === 'quiet' && $e->event === 'audio_started',
        );
    });

    it('announces audio stopping', function () {
        pushMetadata(['slug' => 'quiet', 'title' => 'First Track'])->assertOk();
        pushMetadata(['slug' => 'quiet', 'title' => null, 'artist' => null])->assertOk();

        Event::assertDispatched(
            StationStateChanged::class,
            fn (StationStateChanged $e) => $e->event === 'audio_stopped',
        );
    });

    it('says nothing when one track follows another', function () {
        // The volume decision, asserted. A track change is ~12,300 messages
        // per station per month and the poll already lands on track
        // boundaries by timing itself off `remaining`. Only the transition
        // in and out of saying anything at all reaches the socket.
        pushMetadata(['slug' => 'quiet', 'title' => 'First Track'])->assertOk();
        Event::assertDispatchedTimes(StationStateChanged::class, 1);

        pushMetadata(['slug' => 'quiet', 'title' => 'Second Track'])->assertOk();
        pushMetadata(['slug' => 'quiet', 'title' => 'Third Track', 'artist' => 'Somebody'])->assertOk();

        Event::assertDispatchedTimes(StationStateChanged::class, 1);
    });

    it('says nothing when a clear repeats', function () {
        pushMetadata(['slug' => 'quiet', 'title' => null])->assertOk();
        pushMetadata(['slug' => 'quiet', 'title' => null])->assertOk();

        Event::assertNotDispatched(StationStateChanged::class);
    });
});
