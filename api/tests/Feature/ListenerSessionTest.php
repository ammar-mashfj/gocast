<?php

use App\Models\ListenerSession;
use App\Models\Station;
use App\Models\User;
use App\Services\ListenerAnalytics;
use Illuminate\Support\Facades\Redis;

beforeEach(function () {
    // Durations here are asserted to the second. Without a frozen clock the
    // sub-second remainder of `started_at` is truncated by the column while
    // `ended_at` is not, and a ten-minute session measures 601 seconds about
    // half the time.
    $this->freezeSecond();

    $this->station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    // The live set and the token map are the only state these endpoints keep
    // outside the database, and Redis is shared across the suite.
    $analytics = app(ListenerAnalytics::class);
    foreach (ListenerAnalytics::TRANSPORTS as $transport) {
        Redis::del($analytics->liveKey($this->station->id, $transport));
    }
    Redis::del("listeners:{$this->station->id}");
});

it('opens a session and hands the player a token', function () {
    $response = $this->postJson('/api/public/stations/jazz/listen')
        ->assertCreated()
        ->assertJsonStructure(['data' => ['token', 'beat_every']]);

    $token = $response->json('data.token');

    $session = ListenerSession::find($token);

    expect($session)->not->toBeNull()
        ->and($session->station_id)->toBe($this->station->id)
        ->and($session->transport)->toBe('hls')
        ->and($session->ended_at)->toBeNull();
});

it('counts a session as live as soon as it is opened', function () {
    $this->postJson('/api/public/stations/jazz/listen')->assertCreated();

    $this->getJson('/api/public/stations/jazz/listeners')
        ->assertOk()
        ->assertJsonPath('data.count', 1);
});

it('records device, browser and referrer from the request that opened it', function () {
    $token = $this->postJson('/api/public/stations/jazz/listen', [], [
        'User-Agent' => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Referer' => 'https://www.reddit.com/r/radio/comments/abc123/some_thread/',
    ])->json('data.token');

    $session = ListenerSession::find($token);

    expect($session->device)->toBe('mobile')
        ->and($session->browser)->toBe('Safari')
        // Host only: the path of a referring page can carry personal data and
        // answers no question anybody is asking.
        ->and($session->referrer_host)->toBe('www.reddit.com');
});

it('keeps a session live while the player checks in', function () {
    $token = $this->postJson('/api/public/stations/jazz/listen')->json('data.token');

    // Push the check-in far enough back that the session has fallen out of the
    // live window, then beat: the count must come back rather than staying at
    // zero, which is the whole point of a heartbeat.
    Redis::zadd(
        app(ListenerAnalytics::class)->liveKey($this->station->id, 'hls'),
        now()->subMinutes(5)->timestamp,
        $token,
    );

    $this->getJson('/api/public/stations/jazz/listeners')->assertJsonPath('data.count', 0);

    $this->postJson("/api/public/listen/{$token}/beat")->assertNoContent();

    $this->getJson('/api/public/stations/jazz/listeners')->assertJsonPath('data.count', 1);
});

it('rejects a check-in for a token it has never issued', function () {
    $this->postJson('/api/public/listen/totallymadeuptoken00/beat')
        ->assertNotFound();
});

it('does not touch the database on a check-in', function () {
    $token = $this->postJson('/api/public/stations/jazz/listen')->json('data.token');

    $before = ListenerSession::find($token)->last_seen_at;

    $this->travel(30)->seconds();
    $this->postJson("/api/public/listen/{$token}/beat")->assertNoContent();

    // last_seen_at is refreshed in bulk by the sweep, not per beat — at a
    // thousand listeners the per-beat write would be thousands of row updates
    // a minute to store a number only the sweep reads.
    expect(ListenerSession::find($token)->last_seen_at->timestamp)->toBe($before->timestamp);
});

it('closes the session and records its duration when the player says goodbye', function () {
    $token = $this->postJson('/api/public/stations/jazz/listen')->json('data.token');

    $this->travel(10)->minutes();

    $this->postJson("/api/public/listen/{$token}/end")->assertNoContent();

    $session = ListenerSession::find($token);

    expect($session->ended_at)->not->toBeNull()
        ->and($session->seconds)->toBe(600);

    $this->getJson('/api/public/stations/jazz/listeners')->assertJsonPath('data.count', 0);
});

it('answers a duplicate goodbye without complaining', function () {
    $token = $this->postJson('/api/public/stations/jazz/listen')->json('data.token');

    $this->postJson("/api/public/listen/{$token}/end")->assertNoContent();

    // Sent by navigator.sendBeacon from a page being destroyed: nothing can
    // read the response or retry, so a duplicate must never be an error.
    $this->postJson("/api/public/listen/{$token}/end")->assertNoContent();
});

it('adds HLS and Icecast listeners together', function () {
    $this->postJson('/api/public/stations/jazz/listen')->assertCreated();
    $this->postJson('/api/public/stations/jazz/listen')->assertCreated();

    // What `stations:sync-listeners` writes: Icecast reports a count, never
    // identities, so those listeners can be counted but never given a row.
    Redis::setex("listeners:{$this->station->id}", 300, 5);

    $this->getJson('/api/public/stations/jazz/listeners')
        ->assertJsonPath('data.count', 7);
});

it('404s when opening a session for a station that does not exist', function () {
    $this->postJson('/api/public/stations/no-such-station/listen')->assertNotFound();
});

it('does not double-count a listener who fell back to the Icecast mount', function () {
    // Two people on the station page whose players used Icecast. They hold
    // sockets, so the poll has already counted them — and it counts one more
    // listener in VLC.
    $this->postJson('/api/public/stations/jazz/listen', ['transport' => 'icecast'])->assertCreated();
    $this->postJson('/api/public/stations/jazz/listen', ['transport' => 'icecast'])->assertCreated();
    Redis::setex("listeners:{$this->station->id}", 300, 3);

    $this->getJson('/api/public/stations/jazz/listeners')
        ->assertJsonPath('data.count', 3);
});

it('counts HLS and Icecast listeners on the same station correctly', function () {
    // The mixed case the per-session transport exists for: one listener on
    // HLS (invisible to the poll) and one who fell back to Icecast (already
    // in it), plus two external clients on the mount.
    $this->postJson('/api/public/stations/jazz/listen', ['transport' => 'hls'])->assertCreated();
    $this->postJson('/api/public/stations/jazz/listen', ['transport' => 'icecast'])->assertCreated();
    Redis::setex("listeners:{$this->station->id}", 300, 3);

    // 3 from Icecast (two external + the fallback listener) + 1 on HLS.
    $this->getJson('/api/public/stations/jazz/listeners')
        ->assertJsonPath('data.count', 4);
});

it('still records country and duration for an Icecast-transport session', function () {
    $token = $this->postJson('/api/public/stations/jazz/listen', ['transport' => 'icecast'])
        ->json('data.token');

    $this->travel(4)->minutes();
    $this->postJson("/api/public/listen/{$token}/end")->assertNoContent();

    $session = ListenerSession::find($token);

    // Why these sessions are worth opening even though they add nothing to the
    // live count: Icecast knows how many listeners there are, never who they
    // are or how long they stayed.
    expect($session->transport)->toBe('icecast')
        ->and($session->seconds)->toBe(240)
        ->and($session->device)->not->toBeNull();
});

it('rejects a transport it does not recognise', function () {
    $this->postJson('/api/public/stations/jazz/listen', ['transport' => 'carrier-pigeon'])
        ->assertUnprocessable();
});
