<?php

use App\Enums\StationAudioVerdict;
use App\Events\StationStateChanged;
use App\Jobs\DropStationListeners;
use App\Models\Plan;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\User;
use App\Services\BroadcastSessions;
use App\Services\BroadcastTokenService;
use App\Services\IcecastAdmin;
use App\Services\StationAudioPolicy;
use App\Services\StationLifecycleService;
use App\Services\StationStatusService;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Illuminate\Testing\TestResponse;

/**
 * The Free-plan relay path: a station with no container, whose audio goes
 * browser → relay → Icecast and whose broadcaster Icecast admits by asking
 * Laravel. See docs/RELAY-SERVICE-PLAN.md.
 *
 * The relay itself is Go and tested in relay/. What is tested here is every
 * place Laravel used to assume a container: choosing the path, the power
 * switch, Icecast's two callbacks, the studio's now-playing, status, the
 * auto-stop, the reconciler, and what the player is told to play.
 */
beforeEach(function () {
    config([
        'relay.enabled' => true,
        'relay.rollout' => 'all',
        'relay.ingest_url' => 'wss://relay.test/relay',
        'relay.callback_user' => 'icecast',
        'relay.callback_password' => 'callback-secret',
        'services.icecast.url' => 'http://icecast.test',
        'services.icecast.admin_password' => 'admin-secret',
        'services.internal_api_key' => 'test-internal-key',
        'liquidsoap.hls_base_url' => 'https://stream.test',
        'liquidsoap.silent_stop_seconds' => 60,
        'liquidsoap.studio_gone_stop_seconds' => 150,
    ]);

    Plan::where('slug', 'free')->update(['autodj_enabled' => false, 'encoder_enabled' => false]);
    Plan::where('slug', 'pro')->update(['autodj_enabled' => true, 'encoder_enabled' => true]);

    // One fake for the whole file, reading what each test sets: Http::fake()
    // matches the FIRST stub registered, so a per-test stub added later would
    // never be reached behind a catch-all here.
    $this->icecastMounts = '<icestats/>';
    $this->icecastStatus = 200;
    // mount => [client id => mount history], as listclients reports them.
    $this->icecastClients = [];
    Http::fake(function (HttpRequest $request) {
        if ($this->icecastStatus !== 200) {
            return Http::response('', $this->icecastStatus);
        }

        if (str_contains($request->url(), '/admin/listclients')) {
            // No source on a mount: Icecast answers 404.
            return isset($this->icecastClients[$request['mount']])
                ? Http::response(listClientsXml($request['mount'], $this->icecastClients[$request['mount']]))
                : Http::response('', 404);
        }

        return Http::response(str_contains($request->url(), '/admin/listmounts') ? $this->icecastMounts : '');
    });
});

/** @param  array<int, list<string>>  $listeners */
function listClientsXml(string $mount, array $listeners): string
{
    $xml = '';

    foreach ($listeners as $id => $history) {
        $mounts = implode('', array_map(fn (string $m) => "<mount>{$m}</mount>", $history));
        $xml .= "<listener id=\"{$id}\"><id>{$id}</id><history>{$mounts}</history></listener>";
    }

    return "<?xml version=\"1.0\"?><icestats><source mount=\"{$mount}\">{$xml}</source></icestats>";
}

/** The [mount, id] pairs Icecast was told to disconnect. */
function killedListeners(): array
{
    return Http::recorded(fn (HttpRequest $request) => str_contains($request->url(), '/admin/killclient'))
        ->map(fn (array $pair) => [$pair[0]['mount'], (int) $pair[0]['id']])
        ->values()
        ->all();
}

/** A Free station already started on the relay path. */
function relayStation(array $attributes = []): Station
{
    return Station::factory()->for(User::factory()->onPlan('free'), 'user')->create(array_merge([
        'slug' => 'free-show',
        'desired_state' => Station::STATE_RUNNING,
        'started_at' => now(),
        'ingest_path' => Station::INGEST_RELAY,
    ], $attributes));
}

function onAir(Station $station): Station
{
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    return $station;
}

function icecastCallback(string $path, array $form, ?array $credential = ['icecast', 'callback-secret']): TestResponse
{
    $headers = $credential === null
        ? []
        : ['Authorization' => 'Basic '.base64_encode(implode(':', $credential))];

    return test()->withHeaders($headers)->post("/api/internal/icecast/{$path}", $form);
}

function relayLogin(Station $station, array $overrides = []): TestResponse
{
    $token = app(BroadcastTokenService::class)->issue($station->user, $station);

    return icecastCallback('auth', array_merge([
        'action' => 'stream_auth',
        'mount' => $station->icecast_mount,
        'ip' => '127.0.0.1',
        'user' => $station->slug,
        'pass' => $token,
    ], $overrides));
}

describe('choosing the path', function () {
    it('puts a Free station on the relay', function () {
        $station = Station::factory()->for(User::factory()->onPlan('free'), 'user')->create();

        expect($station->resolveIngestPath())->toBe(Station::INGEST_RELAY);
    });

    it('keeps a plan with AutoDJ or an encoder on the container', function () {
        $station = Station::factory()->for(User::factory()->onPlan('pro'), 'user')->create();

        expect($station->resolveIngestPath())->toBe(Station::INGEST_CONTAINER);
    });

    it('decides by capability, not by plan name', function () {
        // An admin-edited Free plan that gained an encoder needs harbor.
        Plan::where('slug', 'free')->update(['encoder_enabled' => true]);
        $station = Station::factory()->for(User::factory()->onPlan('free'), 'user')->create();

        expect($station->resolveIngestPath())->toBe(Station::INGEST_CONTAINER);
    });

    it('uses the container when the relay is switched off or has no address', function (array $config) {
        config($config);
        $station = Station::factory()->for(User::factory()->onPlan('free'), 'user')->create();

        expect($station->resolveIngestPath())->toBe(Station::INGEST_CONTAINER);
    })->with([
        'disabled' => [['relay.enabled' => false]],
        'no ingest url' => [['relay.ingest_url' => '']],
    ]);

    it('keeps a station whose mount is not /stream/{slug} on the container', function () {
        $station = Station::factory()->for(User::factory()->onPlan('free'), 'user')
            ->create(['slug' => 'renamed', 'icecast_mount' => '/stream/old-name']);

        expect($station->resolveIngestPath())->toBe(Station::INGEST_CONTAINER);
    });

    it('rolls out to listed slugs only', function () {
        config(['relay.rollout' => 'first-one, second-one']);
        $user = User::factory()->onPlan('free');

        $listed = Station::factory()->for($user, 'user')->create(['slug' => 'second-one']);
        $other = Station::factory()->for($user, 'user')->create(['slug' => 'not-listed']);

        expect($listed->resolveIngestPath())->toBe(Station::INGEST_RELAY)
            ->and($other->resolveIngestPath())->toBe(Station::INGEST_CONTAINER);
    });
});

describe('the power switch', function () {
    it('starts a Free station on the relay and records the path', function () {
        $station = Station::factory()->for(User::factory()->onPlan('free'), 'user')->create(['slug' => 'starter']);

        app(StationLifecycleService::class)->start($station);

        expect($station->refresh())
            ->desired_state->toBe(Station::STATE_RUNNING)
            ->ingest_path->toBe(Station::INGEST_RELAY);
    });

    it('starts a Pro station on the container', function () {
        $station = Station::factory()->for(User::factory()->onPlan('pro'), 'user')->create();

        app(StationLifecycleService::class)->start($station);

        expect($station->refresh()->ingest_path)->toBe(Station::INGEST_CONTAINER);
    });

    it('keeps the path a run started on while someone is broadcasting, whatever the plan does', function () {
        $station = relayStation();
        $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);
        $station->user->update(['plan_id' => Plan::where('slug', 'pro')->value('id')]);

        app(StationLifecycleService::class)->start($station->refresh());

        expect($station->refresh()->ingest_path)->toBe(Station::INGEST_RELAY);
    });

    it('moves an idle relay run onto a container when an upgrade asks for one', function () {
        $station = relayStation();
        $station->user->update(['plan_id' => Plan::where('slug', 'pro')->value('id')]);

        app(StationLifecycleService::class)->start($station->refresh());

        expect($station->refresh())
            ->ingest_path->toBe(Station::INGEST_CONTAINER)
            ->desired_state->toBe(Station::STATE_RUNNING);
    });

    it('keeps the path when Icecast carries a show whose connect callback was lost', function () {
        $station = relayStation();
        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';
        $station->user->update(['plan_id' => Plan::where('slug', 'pro')->value('id')]);

        app(StationLifecycleService::class)->start($station->refresh());

        expect($station->refresh()->ingest_path)->toBe(Station::INGEST_RELAY);
    });

    it('keeps the path when Icecast cannot say whether anyone is on it', function () {
        $station = relayStation();
        $this->icecastStatus = 500;
        $station->user->update(['plan_id' => Plan::where('slug', 'pro')->value('id')]);

        app(StationLifecycleService::class)->start($station->refresh());

        expect($station->refresh()->ingest_path)->toBe(Station::INGEST_RELAY);
    });

    it('takes a relay station off air when it is deleted mid-show', function () {
        $station = relayStation();
        $session = $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);
        $this->icecastClients = ['/stream/free-show' => [5 => ['/stream/free-show']]];

        $station->delete();

        expect($session->refresh()->ended_at)->not->toBeNull()
            ->and(killedListeners())->toBe([['/stream/free-show', 5]]);
        Http::assertSent(fn (HttpRequest $request) => str_contains($request->url(), '/admin/killsource')
            && $request['mount'] === '/stream/free-show');
    });

    it('takes the title and the cached status with a station deleted mid-show', function () {
        $station = onAir(relayStation());
        Redis::setex("metadata:{$station->id}", 60, json_encode(['title' => 'Song', 'artist' => null]));
        Cache::put('station-status:'.$station->id, ['stale' => true], 60);

        $station->delete();

        expect(Redis::exists("metadata:{$station->id}"))->toBe(0)
            ->and(Cache::has('station-status:'.$station->id))->toBeFalse();
    });

    it('disconnects nobody for a station that was off when deleted', function () {
        Queue::fake();
        $station = relayStation(['desired_state' => Station::STATE_STOPPED, 'ingest_path' => null]);

        $station->delete();

        Queue::assertNotPushed(DropStationListeners::class);
    });

    it('stops a relay station by cutting its Icecast source', function () {
        $station = relayStation();
        $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

        app(StationLifecycleService::class)->stop($station, force: true);

        expect($station->refresh())
            ->desired_state->toBe(Station::STATE_STOPPED)
            ->ingest_path->toBeNull()
            ->and($station->streamSessions()->whereNull('ended_at')->exists())->toBeFalse();

        Http::assertSent(fn (HttpRequest $request) => str_contains($request->url(), '/admin/killsource')
            && $request['mount'] === '/stream/free-show');
    });

    it('disconnects the audience of a station it stops, on its mount and on /standby', function (string $plan) {
        $station = relayStation($plan === 'pro' ? ['ingest_path' => Station::INGEST_CONTAINER] : []);
        $this->icecastClients = [
            '/stream/free-show' => [7 => ['/stream/free-show']],
            '/standby' => [
                8 => ['/stream/free-show', '/standby'],
                9 => ['/stream/someone-else', '/standby'],
            ],
        ];

        app(StationLifecycleService::class)->stop($station, force: true);

        expect(killedListeners())->toEqualCanonicalizing([
            ['/stream/free-show', 7],
            ['/standby', 8],
        ]);
    })->with(['relay' => 'free', 'container' => 'pro']);

    it('still stops when Icecast cannot be reached', function () {
        $this->icecastStatus = 500;
        $station = relayStation();

        app(StationLifecycleService::class)->stop($station, force: true);

        expect($station->refresh()->desired_state)->toBe(Station::STATE_STOPPED);
    });

    it('treats a source that already left as cut, without a warning', function () {
        // End show closes the studio socket first; Icecast answers 404.
        $this->icecastStatus = 404;
        Log::spy();

        expect(app(IcecastAdmin::class)->killSource(relayStation()))->toBeTrue();
        Log::shouldNotHaveReceived('warning');
    });
});

describe('Icecast auth (url role)', function () {
    it('refuses a callback without the Icecast credential', function (?array $credential) {
        $station = relayStation();
        $token = app(BroadcastTokenService::class)->issue($station->user, $station);

        icecastCallback('auth', ['user' => 'free-show', 'pass' => $token, 'mount' => '/stream/free-show'], $credential)
            ->assertUnauthorized()
            ->assertHeaderMissing('icecast-auth-user');
    })->with([
        'none' => [null],
        'wrong password' => [['icecast', 'nope']],
        'wrong user' => [['admin', 'callback-secret']],
    ]);

    it('admits a running relay station with a fresh token', function () {
        relayLogin(relayStation())
            ->assertOk()
            ->assertHeader('icecast-auth-user', '1');
    });

    it('refuses with a reason', function (Closure $setup, string $reason) {
        $station = relayStation();
        [$station, $overrides] = $setup($station);

        relayLogin($station, $overrides)
            ->assertOk()
            ->assertHeaderMissing('icecast-auth-user')
            ->assertHeader('icecast-auth-message', $reason);
    })->with([
        'unknown station' => [fn (Station $s) => [$s, ['user' => 'nobody-here', 'mount' => '/stream/nobody-here']], 'unknown station'],
        'another station\'s mount' => [fn (Station $s) => [$s, ['mount' => '/stream/someone-else']], 'mount does not belong to this station'],
        'station off' => [function (Station $s) {
            $s->update(['desired_state' => Station::STATE_STOPPED, 'ingest_path' => null]);

            return [$s, []];
        }, 'station is off'],
        'container station' => [function (Station $s) {
            $s->update(['ingest_path' => Station::INGEST_CONTAINER]);

            return [$s, []];
        }, 'station is not on the relay path'],
        'garbage token' => [fn (Station $s) => [$s, ['pass' => 'not-a-token']], 'invalid or expired credential'],
        'malformed user' => [fn (Station $s) => [$s, ['user' => 'Free Show']], 'malformed login'],
    ]);

    it('refuses an expired token', function () {
        $station = relayStation();
        $token = app(BroadcastTokenService::class)->issue($station->user, $station);

        $this->travel(BroadcastTokenService::TTL_SECONDS + 5)->seconds();

        relayLogin($station, ['pass' => $token])
            ->assertHeader('icecast-auth-message', 'invalid or expired credential');
    });

    it('refuses a token minted for another station', function () {
        $station = relayStation();
        $other = relayStation(['slug' => 'other-show']);
        $token = app(BroadcastTokenService::class)->issue($other->user, $other);

        relayLogin($station, ['pass' => $token])
            ->assertHeader('icecast-auth-message', 'invalid or expired credential');
    });
});

describe('Icecast events', function () {
    it('opens a session on connect and closes it on disconnect', function () {
        $station = relayStation();
        Redis::setex("metadata:{$station->id}", 60, json_encode(['title' => 'Old', 'artist' => null]));

        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show'])->assertOk();

        $session = $station->streamSessions()->sole();
        expect($session->ended_at)->toBeNull()
            ->and($session->source_type)->toBe('browser');

        icecastCallback('event', ['action' => 'source-disconnect', 'mount' => '/stream/free-show'])->assertOk();

        expect($session->refresh()->ended_at)->not->toBeNull()
            ->and(Redis::exists("metadata:{$station->id}"))->toBe(0);
    });

    it('ignores a disconnect that arrives after the studio is already back', function () {
        $station = relayStation();
        $session = $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);
        Redis::setex("metadata:{$station->id}", 60, json_encode(['title' => 'Re-sent', 'artist' => null]));

        // The reconnected source already holds the mount.
        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';

        icecastCallback('event', ['action' => 'source-disconnect', 'mount' => '/stream/free-show'])->assertOk();
        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show'])->assertOk();

        expect($station->streamSessions()->sole()->is($session))->toBeTrue()
            ->and($session->refresh()->ended_at)->toBeNull()
            ->and(Redis::exists("metadata:{$station->id}"))->toBe(1);
    });

    it('puts a seamless reconnect on neither the timeline nor the dashboard', function () {
        $station = onAir(relayStation());
        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';
        Event::fake([StationStateChanged::class]);

        icecastCallback('event', ['action' => 'source-disconnect', 'mount' => '/stream/free-show'])->assertOk();
        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show'])->assertOk();

        expect(StationEvent::where('station_id', $station->id)->count())->toBe(0);
        Event::assertNotDispatched(StationStateChanged::class);
    });

    it('records a real disconnect and connect', function () {
        $station = relayStation();
        Event::fake([StationStateChanged::class]);

        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show'])->assertOk();
        icecastCallback('event', ['action' => 'source-disconnect', 'mount' => '/stream/free-show'])->assertOk();

        expect(StationEvent::where('station_id', $station->id)->pluck('type')->all())
            ->toBe([StationEvent::TYPE_LIVE_CONNECTED, StationEvent::TYPE_LIVE_DISCONNECTED]);
        Event::assertDispatchedTimes(StationStateChanged::class, 2);
    });

    it('closes the session when Icecast cannot say whether the mount is back', function () {
        $station = relayStation();
        $session = $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);
        $this->icecastMounts = 'not xml';

        icecastCallback('event', ['action' => 'source-disconnect', 'mount' => '/stream/free-show'])->assertOk();

        expect($session->refresh()->ended_at)->not->toBeNull();
    });

    it('opens one session however often the connect is reported', function () {
        $station = relayStation();

        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show']);
        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show']);

        expect($station->streamSessions()->count())->toBe(1);
    });

    it('leaves container stations and the silence feed to themselves', function () {
        $container = relayStation(['slug' => 'pro-show', 'ingest_path' => Station::INGEST_CONTAINER]);

        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/pro-show'])->assertOk();
        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/standby'])->assertOk();

        expect($container->streamSessions()->count())->toBe(0);
    });

    it('refuses quietly when the callback password is not configured', function () {
        config(['relay.callback_password' => '']);
        relayStation();
        Log::spy();

        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show'])->assertUnauthorized();
        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show'])->assertUnauthorized();

        Log::shouldHaveReceived('warning')->once();
    });

    it('needs the Icecast credential', function () {
        relayStation();

        icecastCallback('event', ['action' => 'source-connect', 'mount' => '/stream/free-show'], null)->assertUnauthorized();
    });
});

describe('the studio\'s now playing', function () {
    it('stores the title and tells Icecast', function () {
        $station = onAir(relayStation());

        $this->actingAs($station->user)
            ->postJson("/api/stations/{$station->slug}/now-playing", ['title' => 'أغنية', 'artist' => 'Café'])
            ->assertOk()
            ->assertJson(['playing' => true]);

        expect(json_decode(Redis::get("metadata:{$station->id}"), true))
            ->toBe(['title' => 'أغنية', 'artist' => 'Café']);

        Http::assertSent(fn (HttpRequest $request) => str_contains($request->url(), '/admin/metadata')
            && $request['song'] === 'Café - أغنية'
            && $request['mount'] === '/stream/free-show');
    });

    it('sends Icecast the same trimmed text it stores', function () {
        $station = onAir(relayStation());

        $this->actingAs($station->user)
            ->postJson("/api/stations/{$station->slug}/now-playing", ['title' => '  Song  ', 'artist' => '   '])
            ->assertJson(['playing' => true]);

        Http::assertSent(fn (HttpRequest $request) => str_contains($request->url(), '/admin/metadata')
            && $request['song'] === 'Song');
    });

    it('clears it on an empty title', function () {
        $station = onAir(relayStation());
        Redis::setex("metadata:{$station->id}", 60, json_encode(['title' => 'Old', 'artist' => null]));

        $this->actingAs($station->user)
            ->postJson("/api/stations/{$station->slug}/now-playing", ['title' => '', 'artist' => null])
            ->assertJson(['playing' => false]);

        expect(Redis::exists("metadata:{$station->id}"))->toBe(0);
    });

    it('refuses a title when nobody is broadcasting', function () {
        // A switched-on station with no studio, or a studio's late retry
        // after its show closed: either would bring back a stale "now playing".
        $station = relayStation();

        $this->actingAs($station->user)
            ->postJson("/api/stations/{$station->slug}/now-playing", ['title' => 'Song'])
            ->assertStatus(409);

        expect(Redis::exists("metadata:{$station->id}"))->toBe(0);
        Http::assertNotSent(fn (HttpRequest $request) => str_contains($request->url(), '/admin/metadata'));
    });

    it('takes the first title of a show Icecast carries before its session opens', function () {
        $station = relayStation();
        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';

        $this->actingAs($station->user)
            ->postJson("/api/stations/{$station->slug}/now-playing", ['title' => 'Song'])
            ->assertOk()
            ->assertJson(['playing' => true]);
    });

    it('belongs to the container on the container path', function () {
        $station = relayStation(['ingest_path' => Station::INGEST_CONTAINER]);

        $this->actingAs($station->user)
            ->postJson("/api/stations/{$station->slug}/now-playing", ['title' => 'Song'])
            ->assertStatus(409);
    });

    it('is the owner\'s alone', function () {
        $station = relayStation();

        $this->actingAs(User::factory()->create())
            ->postJson("/api/stations/{$station->slug}/now-playing", ['title' => 'Song'])
            ->assertForbidden();
    });
});

describe('what the studio and the player are told', function () {
    it('sends a relay studio to the relay', function () {
        $station = relayStation();

        $this->actingAs($station->user)
            ->postJson('/api/auth/broadcast-token', ['station_slug' => $station->slug])
            ->assertOk()
            ->assertJson(['ingest' => 'relay', 'ingest_url' => 'wss://relay.test/relay']);
    });

    it('sends a container studio to its container', function () {
        config(['liquidsoap.ingest_url' => 'ws://harbor.test/{slug}']);
        $station = relayStation(['ingest_path' => Station::INGEST_CONTAINER]);

        $this->actingAs($station->user)
            ->postJson('/api/auth/broadcast-token', ['station_slug' => $station->slug])
            ->assertJson(['ingest' => 'container', 'ingest_url' => 'ws://harbor.test/free-show']);
    });

    it('reports a relay station ready at once, live while a session is open', function () {
        $station = relayStation();
        $status = app(StationStatusService::class);

        expect($status->state($station))->toBe(StationStatusService::STATE_ON_AIR)
            ->and($status->isReady($station))->toBeTrue();

        $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);
        $status->forget($station);

        expect($status->state($station))->toBe(StationStatusService::STATE_LIVE);

        $this->actingAs($station->user)
            ->getJson("/api/stations/{$station->slug}/status")
            ->assertJsonPath('data.ingest', 'relay')
            ->assertJsonPath('data.state', 'live');
    });

    it('gives the player no HLS for a relay run, and says so in the live feed', function () {
        $station = relayStation();

        $this->getJson("/api/public/stations/{$station->slug}")->assertJsonPath('data.hls_url', null);
        $this->getJson("/api/public/stations/{$station->slug}/listeners")->assertJsonPath('data.icecast_only', true);

        $station->update(['ingest_path' => Station::INGEST_CONTAINER]);

        $this->getJson("/api/public/stations/{$station->slug}")
            ->assertJsonPath('data.hls_url', 'https://stream.test/free-show/aac.m3u8');
        $this->getJson("/api/public/stations/{$station->slug}/listeners")->assertJsonPath('data.icecast_only', false);
    });
});

describe('auto-stop', function () {
    it('keeps a relay station with a broadcaster on air', function () {
        $station = relayStation();
        $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

        $verdict = app(StationAudioPolicy::class)->verdict($station, app(StationStatusService::class)->pullFresh($station));

        expect($verdict)->toBe(StationAudioVerdict::InUse);
    });

    it('stops a relay station soon after the studio has gone for good', function () {
        $station = relayStation(['started_at' => now()->subMinutes(30)]);
        $station->streamSessions()->create([
            'started_at' => now()->subMinutes(20),
            'ended_at' => now()->subSeconds(151),
            'source_type' => 'browser',
        ]);

        $verdict = app(StationAudioPolicy::class)->verdict($station, app(StationStatusService::class)->pullFresh($station));

        expect($verdict)->toBe(StationAudioVerdict::Stop);
    });

    it('keeps a relay show Icecast is carrying even when its connect callback was lost', function () {
        // On air for 20 minutes, reconnected after a drop, but the new
        // source-connect never reached Laravel: no open session.
        $station = relayStation(['started_at' => now()->subMinutes(30)]);
        $station->streamSessions()->create([
            'started_at' => now()->subMinutes(20),
            'ended_at' => now()->subSeconds(151),
            'source_type' => 'browser',
        ]);
        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';

        $verdict = app(StationAudioPolicy::class)->verdict($station, app(StationStatusService::class)->pullFresh($station));

        expect($verdict)->toBe(StationAudioVerdict::InUse);
    });

    it('runs the silence clock for a relay station nobody broadcasts into', function () {
        $station = relayStation();
        $policy = app(StationAudioPolicy::class);
        $status = app(StationStatusService::class);

        expect($policy->verdict($station, $status->pullFresh($station)))->toBe(StationAudioVerdict::Silent);

        $station->update(['silent_since' => now()->subSeconds(61)]);

        expect($policy->verdict($station->refresh(), $status->pullFresh($station)))->toBe(StationAudioVerdict::Stop);
    });
});

describe('the reconciler', function () {
    it('never builds a container for a running relay station', function () {
        relayStation();

        $this->artisan('stations:reconcile --dry-run')
            ->doesntExpectOutputToContain('start free-show')
            ->assertSuccessful();
    });

    it('closes a relay session Icecast no longer carries, after the strike budget', function () {
        $station = relayStation();
        $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

        $this->icecastMounts = '<icestats><source mount="/standby"/><source mount="/stream/someone-else"/></icestats>';

        $limit = (int) config('liquidsoap.stranded_session_strikes');

        foreach (range(1, $limit - 1) as $pass) {
            $this->artisan('stations:reconcile')->run();
        }
        expect($station->isLive())->toBeTrue();

        $this->artisan('stations:reconcile')->run();
        expect($station->isLive())->toBeFalse();
    });

    it('disconnects /standby listeners whose station is off, and keeps a running one\'s', function () {
        relayStation();
        Station::factory()->create(['slug' => 'stopped-show', 'desired_state' => Station::STATE_STOPPED]);

        $this->icecastClients = ['/standby' => [
            1 => ['/stream/free-show', '/standby'],    // waiting for its studio to reconnect
            2 => ['/stream/stopped-show', '/standby'], // its station is off
            3 => ['/stream/deleted-long-ago', '/standby'],
            4 => ['/standby'],                         // asked for the silence feed directly
        ]];

        $this->artisan('stations:reconcile')->assertSuccessful();

        expect(killedListeners())->toEqualCanonicalizing([
            ['/standby', 2],
            ['/standby', 3],
            ['/standby', 4],
        ]);
    });

    it('reopens the session of a relay show whose connect callback was lost', function () {
        $station = relayStation();
        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';

        $this->artisan('stations:reconcile')->assertSuccessful();

        expect($station->isLive())->toBeTrue();
    });

    it('puts a reopened show on the timeline', function () {
        $station = relayStation();
        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';

        $this->artisan('stations:reconcile')->assertSuccessful();

        expect(StationEvent::where('station_id', $station->id)->sole()->type)
            ->toBe(StationEvent::TYPE_LIVE_CONNECTED);
    });

    it('says whether it opened a session, so a reconcile that loses the race stays quiet', function () {
        $station = relayStation();
        $sessions = app(BroadcastSessions::class);

        expect($sessions->open($station, 'browser', null))->toBeTrue()
            ->and($sessions->open($station, 'browser', null))->toBeFalse()
            ->and($station->streamSessions()->count())->toBe(1);
    });

    it('opens nothing for a relay station Icecast is not carrying', function () {
        $station = relayStation();

        $this->artisan('stations:reconcile')->assertSuccessful();

        expect($station->isLive())->toBeFalse();
    });

    it('disconnects nobody on a dry run', function () {
        $this->icecastClients = ['/standby' => [1 => ['/stream/gone', '/standby']]];

        $this->artisan('stations:reconcile --dry-run')->assertSuccessful();

        expect(killedListeners())->toBe([]);
    });

    it('keeps a relay session Icecast still carries', function () {
        $station = relayStation();
        $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

        $this->icecastMounts = '<icestats><source mount="/stream/free-show"/></icestats>';

        foreach (range(1, (int) config('liquidsoap.stranded_session_strikes') + 2) as $pass) {
            $this->artisan('stations:reconcile')->run();
        }

        expect($station->isLive())->toBeTrue();
    });

    it('never closes a relay session when Icecast cannot be asked', function () {
        $station = relayStation();
        $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

        $this->icecastStatus = 503;

        foreach (range(1, (int) config('liquidsoap.stranded_session_strikes') + 2) as $pass) {
            $this->artisan('stations:reconcile')->run();
            Cache::flush();
        }

        expect($station->isLive())->toBeTrue();
    });
});
