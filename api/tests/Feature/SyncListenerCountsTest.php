<?php

use App\Console\Commands\SyncListenerCounts;
use App\Models\Station;
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

it('warns the admin once Icecast holds 80% of its source limit', function (int $sources, bool $alerted) {
    config([
        'services.icecast.max_sources' => 10,
        'services.telegram.bot_token' => 'bot-token',
        'services.telegram.admin_chat_id' => '42',
    ]);

    $mounts = [];
    foreach (range(1, $sources) as $i) {
        $mounts["/stream/s{$i}"] = 0;
    }

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats($mounts)),
        'api.telegram.org/*' => Http::response(['ok' => true]),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();

    Http::assertSentCount($alerted ? 2 : 1);
})->with([
    'below the threshold' => [7, false],
    'at the threshold' => [8, true],
]);

it('does not repeat the source-limit warning every minute', function () {
    config([
        'services.icecast.max_sources' => 10,
        'services.telegram.bot_token' => 'bot-token',
        'services.telegram.admin_chat_id' => '42',
    ]);

    Http::fake([
        'icecast:8000/admin/stats' => Http::response(icecastStats(array_fill_keys(
            array_map(fn (int $i) => "/stream/s{$i}", range(1, 9)), 0,
        ))),
        'api.telegram.org/*' => Http::response(['ok' => true]),
    ]);

    artisan('stations:sync-listeners')->assertSuccessful();
    artisan('stations:sync-listeners')->assertSuccessful();

    Http::assertSentCount(3); // two stats polls, one alert
});
