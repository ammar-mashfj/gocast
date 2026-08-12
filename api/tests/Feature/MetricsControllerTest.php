<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;

use function Pest\Laravel\getJson;
use function Pest\Laravel\withHeaders;

beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);

    // Stub the supervisor so the metric scrape doesn't shell out to docker.
    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('listManagedContainers')->andReturn([]);
    $this->app->instance(LiquidsoapSupervisor::class, $supervisor);
});

it('rejects scrape requests without the internal key', function () {
    getJson('/api/internal/metrics')->assertUnauthorized();
});

it('returns prometheus-format metrics for an authenticated scrape', function () {
    Station::factory()->for(User::factory(), 'user')->create();

    $response = withHeaders(['X-Internal-Key' => 'test-internal-key'])
        ->get('/api/internal/metrics')
        ->assertOk();

    expect($response->headers->get('Content-Type'))->toContain('text/plain');

    $body = $response->getContent();
    expect($body)->toContain('# HELP');
    expect($body)->toContain('# TYPE');
    expect($body)->toContain('gocast_stations_total');
    expect($body)->toContain('gocast_stations_live');
    expect($body)->toContain('gocast_tracks_total');
    expect($body)->toContain('gocast_users_total');
});
