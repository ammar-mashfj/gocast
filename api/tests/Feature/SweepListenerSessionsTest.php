<?php

use App\Models\ListenerSession;
use App\Models\ListenerStatHourly;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use App\Services\ListenerAnalytics;
use Illuminate\Support\Facades\Redis;

use function Pest\Laravel\artisan;

beforeEach(function () {
    $this->freezeSecond();

    $this->station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);
    $this->analytics = app(ListenerAnalytics::class);

    foreach (ListenerAnalytics::TRANSPORTS as $transport) {
        Redis::del($this->analytics->liveKey($this->station->id, $transport));
    }
    Redis::del("listeners:{$this->station->id}");
});

/** Put a session in a transport's live set with a specific last-check-in time. */
function liveSession(Station $station, ListenerSession $session, int $secondsAgo = 0, string $transport = 'hls'): void
{
    Redis::zadd(
        app(ListenerAnalytics::class)->liveKey($station->id, $transport),
        now()->subSeconds($secondsAgo)->timestamp,
        $session->id,
    );
}

it('leaves a session that is still checking in alone', function () {
    $session = ListenerSession::factory()->for($this->station)->create([
        'started_at' => now()->subMinutes(5),
        'last_seen_at' => now()->subMinutes(5),
    ]);
    liveSession($this->station, $session, secondsAgo: 5);

    artisan('listeners:sweep')->assertSuccessful();

    expect($session->fresh()->ended_at)->toBeNull();
});

it('closes a session at its last check-in, not at the time it was noticed', function () {
    $session = ListenerSession::factory()->for($this->station)->create([
        'started_at' => now()->subMinutes(10),
        'last_seen_at' => now()->subMinutes(10),
    ]);

    // Quiet for three minutes: well past idle_close_seconds.
    liveSession($this->station, $session, secondsAgo: 180);

    artisan('listeners:sweep')->assertSuccessful();

    $closed = $session->fresh();

    // Seven minutes of listening, not ten — crediting the three idle minutes
    // it took us to notice would inflate every session by the sweep interval.
    expect($closed->ended_at->timestamp)->toBe(now()->subMinutes(3)->timestamp)
        ->and($closed->seconds)->toBe(420);
});

it('drops a closed session out of the live set', function () {
    $session = ListenerSession::factory()->for($this->station)->create();
    liveSession($this->station, $session, secondsAgo: 300);

    artisan('listeners:sweep')->assertSuccessful();

    expect(Redis::zcard($this->analytics->liveKey($this->station->id, 'hls')))->toBe(0);
});

it('refreshes last_seen_at for sessions that are still live', function () {
    $session = ListenerSession::factory()->for($this->station)->create([
        'started_at' => now()->subMinutes(20),
        'last_seen_at' => now()->subMinutes(20),
    ]);
    liveSession($this->station, $session, secondsAgo: 3);

    artisan('listeners:sweep')->assertSuccessful();

    // Written so the database can stand alone if Redis is ever lost.
    expect($session->fresh()->last_seen_at->timestamp)->toBe(now()->timestamp);
});

it('closes orphaned sessions whose tokens vanished from Redis', function () {
    // Exactly what a Redis flush leaves behind: an open row with no token in
    // any set, which nothing would otherwise ever close.
    $orphan = ListenerSession::factory()->for($this->station)->create([
        'started_at' => now()->subMinutes(30),
        'last_seen_at' => now()->subMinutes(29),
    ]);

    artisan('listeners:sweep')->assertSuccessful();

    $closed = $orphan->fresh();

    expect($closed->ended_at)->not->toBeNull()
        ->and($closed->seconds)->toBe(60);
});

it('closes a session that has run past the maximum session length', function () {
    config(['analytics.max_session_hours' => 12]);

    // A tab left open on a desk, beating faithfully. Without a cap one
    // listener contributes days of listening time to a station's totals.
    $session = ListenerSession::factory()->for($this->station)->create([
        'started_at' => now()->subHours(20),
        'last_seen_at' => now(),
    ]);
    liveSession($this->station, $session, secondsAgo: 2);

    artisan('listeners:sweep')->assertSuccessful();

    expect($session->fresh()->ended_at)->not->toBeNull();
});

it('samples concurrent listeners into the hourly rollup', function () {
    $sessions = ListenerSession::factory()->count(3)->for($this->station)->create();

    foreach ($sessions as $session) {
        liveSession($this->station, $session, secondsAgo: 2);
    }

    artisan('listeners:sweep')->assertSuccessful();

    $hour = ListenerStatHourly::where('station_id', $this->station->id)->first();

    expect($hour->peak_listeners)->toBe(3)
        ->and($hour->listener_minutes)->toBe(3)
        ->and($hour->sampled_minutes)->toBe(1);
});

it('accumulates listener-minutes across samples and keeps the highest peak', function () {
    $sessions = ListenerSession::factory()->count(4)->for($this->station)->create();

    foreach ($sessions as $session) {
        liveSession($this->station, $session, secondsAgo: 2);
    }

    artisan('listeners:sweep')->assertSuccessful();

    // Two listeners leave, but not far enough back to be closed — the second
    // sample sees a smaller audience within the same hour.
    liveSession($this->station, $sessions[2], secondsAgo: 50);
    liveSession($this->station, $sessions[3], secondsAgo: 50);

    artisan('listeners:sweep')->assertSuccessful();

    $hour = ListenerStatHourly::where('station_id', $this->station->id)->first();

    expect($hour->peak_listeners)->toBe(4)
        // Because samples are a minute apart, their sum IS listener-minutes.
        ->and($hour->listener_minutes)->toBe(6)
        ->and($hour->sampled_minutes)->toBe(2);
});

it('includes Icecast listeners in the sampled total', function () {
    Redis::setex("listeners:{$this->station->id}", 300, 4);

    artisan('listeners:sweep')->assertSuccessful();

    // Icecast listeners never get a session row, so this sample is the only
    // way their listening time is ever measured.
    expect(ListenerStatHourly::where('station_id', $this->station->id)->value('listener_minutes'))
        ->toBe(4);
});

it('closes an Icecast-transport session even though it is never counted', function () {
    $session = ListenerSession::factory()->for($this->station)->create([
        'transport' => 'icecast',
        'started_at' => now()->subMinutes(10),
        'last_seen_at' => now()->subMinutes(10),
    ]);
    liveSession($this->station, $session, secondsAgo: 180, transport: 'icecast');

    artisan('listeners:sweep')->assertSuccessful();

    // It adds nothing to the live count, but its recorded duration would be a
    // fiction if nothing ever closed it.
    expect($session->fresh()->seconds)->toBe(420);
});

it('writes no row for a station nobody is listening to', function () {
    artisan('listeners:sweep')->assertSuccessful();

    // Sparse on purpose: a dormant station costs zero rows a day rather than
    // 24 empty ones, and a missing row reads as zero.
    expect(ListenerStatHourly::where('station_id', $this->station->id)->exists())->toBeFalse();
});

/** An open broadcast for the station under test. */
function openBroadcast(Station $station, int $peak = 0): StreamSession
{
    return StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinutes(10),
        'ended_at' => null,
        'peak_listeners' => $peak,
    ]);
}

/**
 * THE REGRESSION. `peak_listeners` used to be written by
 * `stations:sync-listeners`, which only ever saw the Icecast mount count — so
 * every listener on our own HLS player was missing from the broadcasts page
 * while the player page showed the real number.
 */
it('raises the broadcast peak from HLS listeners, who Icecast cannot see', function () {
    $broadcast = openBroadcast($this->station, peak: 0);

    foreach (range(1, 3) as $i) {
        $session = ListenerSession::factory()->for($this->station)->create([
            'started_at' => now()->subMinutes(2),
            'last_seen_at' => now(),
        ]);
        liveSession($this->station, $session, secondsAgo: 5);
    }

    // Icecast reports nobody: these three are HLS only.
    Redis::set("listeners:{$this->station->id}", 0);

    artisan('listeners:sweep')->assertSuccessful();

    expect($broadcast->fresh()->peak_listeners)->toBe(3);
});

it('counts HLS and Icecast listeners as one audience', function () {
    $broadcast = openBroadcast($this->station, peak: 0);

    $session = ListenerSession::factory()->for($this->station)->create([
        'started_at' => now()->subMinutes(2),
        'last_seen_at' => now(),
    ]);
    liveSession($this->station, $session, secondsAgo: 5);

    Redis::set("listeners:{$this->station->id}", 4);

    artisan('listeners:sweep')->assertSuccessful();

    expect($broadcast->fresh()->peak_listeners)->toBe(5);
});

it('leaves the peak alone when the current count is lower', function () {
    $broadcast = openBroadcast($this->station, peak: 12);

    Redis::set("listeners:{$this->station->id}", 3);

    artisan('listeners:sweep')->assertSuccessful();

    expect($broadcast->fresh()->peak_listeners)->toBe(12);
});

it('does not touch peaks on broadcasts that already ended', function () {
    $ended = StreamSession::create([
        'station_id' => $this->station->id,
        'started_at' => now()->subHour(),
        'ended_at' => now()->subMinutes(30),
        'peak_listeners' => 2,
    ]);

    Redis::set("listeners:{$this->station->id}", 8);

    artisan('listeners:sweep')->assertSuccessful();

    expect($ended->fresh()->peak_listeners)->toBe(2);
});

/**
 * Listeners during AutoDJ are real and counted for the station, but they
 * belong to no broadcast — which is the whole reason the link is resolved
 * against the open session at write time rather than stamped on each listener.
 */
it('records no broadcast peak when nobody is on air', function () {
    Redis::set("listeners:{$this->station->id}", 6);

    artisan('listeners:sweep')->assertSuccessful();

    expect(StreamSession::count())->toBe(0)
        ->and((int) ListenerStatHourly::sum('peak_listeners'))->toBe(6);
});
