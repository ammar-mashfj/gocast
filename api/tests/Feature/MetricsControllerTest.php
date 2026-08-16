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

it('counts only stations that want to be on air as expected containers', function () {
    // This gauge is the drift alert. Counting every station row — which it did
    // before the power button existed — makes every deliberately stopped
    // station read as missing capacity, so the alert is permanently firing and
    // therefore permanently ignored.
    $user = User::factory()->create();
    Station::factory()->for($user, 'user')->count(2)->create(['desired_state' => Station::STATE_RUNNING]);
    Station::factory()->for($user, 'user')->count(3)->create(['desired_state' => Station::STATE_STOPPED]);

    $body = test()->getJson('/api/internal/metrics', [
        'X-Internal-Key' => config('services.internal_api_key'),
    ])->assertOk()->getContent();

    expect($body)
        ->toContain('gocast_supervisor_containers_expected 2')
        ->toContain('gocast_stations_stopped 3');
});

it('exposes an unhealthy container gauge', function () {
    // The blind spot this pass exists to close — a container that is present
    // but not working was invisible to every metric we had.
    $body = test()->getJson('/api/internal/metrics', [
        'X-Internal-Key' => config('services.internal_api_key'),
    ])->assertOk()->getContent();

    expect($body)->toContain('gocast_supervisor_containers_unhealthy');
});
