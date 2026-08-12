<?php

use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\Redis;

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
