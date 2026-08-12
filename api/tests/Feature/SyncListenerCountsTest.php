<?php

use App\Console\Commands\SyncListenerCounts;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Redis;

use function Pest\Laravel\artisan;

beforeEach(function () {
    config([
        'services.icecast.url' => 'http://icecast:8000',
        'services.icecast.admin_user' => 'admin',
        'services.icecast.admin_password' => 'secret',
    ]);
});

/**
 * Shape of a real Icecast /admin/stats response, trimmed to the elements the
 * command reads.
 */
function icecastStats(array $mountsToListeners): string
{
    $sources = '';
    foreach ($mountsToListeners as $mount => $listeners) {
        $sources .= "<source mount=\"{$mount}\"><listeners>{$listeners}</listeners></source>";
    }

    return "<?xml version=\"1.0\"?><icestats>{$sources}</icestats>";
}

it('caches per-station listener counts from the Icecast admin API', function () {
    $user = User::factory()->create();
    $jazz = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);
    $rock = Station::factory()->for($user, 'user')->create(['slug' => 'rock']);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats([
            $jazz->icecast_mount => 7,
            $rock->icecast_mount => 0,
        ])),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    expect((int) Redis::get("listeners:{$jazz->id}"))->toBe(7);
    expect((int) Redis::get("listeners:{$rock->id}"))->toBe(0);
});

it('resets stations Icecast has no source for back to zero', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    Redis::set("listeners:{$station->id}", 42);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats([])),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    expect((int) Redis::get("listeners:{$station->id}"))->toBe(0);
});

it('sets a TTL so counts expire when the scheduler stops running', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats([$station->icecast_mount => 3])),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    $ttl = Redis::ttl("listeners:{$station->id}");
    expect($ttl)->toBeGreaterThan(0)
        ->and($ttl)->toBeLessThanOrEqual(SyncListenerCounts::REDIS_TTL_SECONDS);
});

it('raises the open stream session peak when the current count exceeds it', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now(),
        'ended_at' => null,
        'peak_listeners' => 4,
    ]);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats([$station->icecast_mount => 9])),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    expect($session->fresh()->peak_listeners)->toBe(9);
});

it('leaves the peak alone when the current count is lower', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now(),
        'ended_at' => null,
        'peak_listeners' => 12,
    ]);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats([$station->icecast_mount => 3])),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    expect($session->fresh()->peak_listeners)->toBe(12);
});

it('does not touch peaks on sessions that already ended', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    $ended = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subHour(),
        'ended_at' => now()->subMinutes(30),
        'peak_listeners' => 2,
    ]);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats([$station->icecast_mount => 8])),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    expect($ended->fresh()->peak_listeners)->toBe(2);
});

it('fails without wiping cached counts when Icecast is unreachable', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create(['slug' => 'jazz']);

    Redis::set("listeners:{$station->id}", 5);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response('nope', 500),
    ]);

    artisan('stations:sync-listeners')->assertFailed();

    // Left for its own TTL to expire rather than zeroed on a transient error.
    expect((int) Redis::get("listeners:{$station->id}"))->toBe(5);
});

it('fails cleanly when the admin password is not configured', function () {
    config(['services.icecast.admin_password' => '']);

    Http::fake();

    artisan('stations:sync-listeners')->assertFailed();

    Http::assertNothingSent();
});

it('authenticates to the admin API with the configured credentials', function () {
    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats([])),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    Http::assertSent(function ($request) {
        return $request->url() === 'http://icecast:8000/admin/stats'
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('admin:secret'));
    });
});
