<?php

namespace App\Services;

use App\Models\ListenerSession;
use App\Models\Station;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

/**
 * Counting an audience that has no connection to count.
 *
 * Icecast knows its listener count because each listener holds a socket open:
 * ask the server, get the answer. HLS has no such thing — the player fetches
 * a manifest and some segments and walks away, over and over, and nobody ever
 * hangs up. So a listener has to be given an IDENTITY and then observed:
 *
 *   1. The player asks for a token when someone presses play. That request is
 *      an ordinary API call, so this is the one moment we can see a real
 *      client IP — which is where country comes from, and why it is resolved
 *      here and never again.
 *   2. The player checks in every `beat_interval_seconds` while audio is
 *      actually playing. Each check-in is one Redis write and no database
 *      write at all.
 *   3. "Listeners right now" is the number of tokens that checked in within
 *      `live_window_seconds` — a ZCOUNT over a sorted set scored by last-seen.
 *   4. A token that stops checking in for `idle_close_seconds` is closed by
 *      `listeners:sweep`, which is the only place a session's end time is
 *      ever written.
 *
 * WHY THE PLAYER REPORTS INSTEAD OF THE SERVER COUNTING REQUESTS. The other
 * way to do this is to watch nginx's log of manifest requests. That works, and
 * it catches clients that never run our JavaScript, but it needs a log tailer
 * running outside Laravel and it can only ever see requests. The player knows
 * things a log cannot: whether audio is actually PLAYING or merely paused with
 * the tab open, and that someone has left the moment they leave rather than 45
 * seconds later. It also keeps Laravel out of the audio path, so an API
 * outage costs statistics rather than silence — which is the failure mode you
 * want when the alternative is every station going quiet.
 *
 * The cost is that only our own player is counted. Icecast listeners are
 * counted separately and folded in by {@see liveCount()}; external HLS clients
 * are not counted at all today, which is why the manifest-through-Laravel path
 * is left open in the `transport` column.
 */
class ListenerAnalytics
{
    public function __construct(
        private readonly GeoResolver $geo,
        private readonly UserAgentParser $agents,
    ) {}

    /** The transports a listener can arrive over. */
    public const TRANSPORTS = ['hls', 'icecast'];

    /**
     * Sorted set of live tokens for one station on one transport, scored by
     * last check-in.
     *
     * A sorted set is the right shape because every question here is a range
     * over time: who is still live (count above a score), who has gone quiet
     * (range below it), and drop them (remove that range) — each O(log n) and
     * none of them needing to touch the database.
     *
     * SPLIT BY TRANSPORT because only one of them may be added to the live
     * count. A listener playing the Icecast mount is already inside the number
     * `stations:sync-listeners` polls; their session is still worth keeping
     * for country and duration, but counting it again would report them twice.
     * Keeping the two in separate sets means that distinction is a property of
     * each listener rather than a global setting that has to be right for
     * everybody at once — so a station whose player fell back to Icecast stays
     * correct even while every other station is on HLS.
     */
    public function liveKey(string $stationId, string $transport = 'hls'): string
    {
        return "listeners:live:{$stationId}:{$transport}";
    }

    /**
     * Token → "stationId:transport", so a check-in costs one Redis read
     * instead of a database lookup and still knows which set to touch.
     * Expires on its own well after the session cap, so a token can never be
     * revived days later.
     */
    public function tokenKey(string $token): string
    {
        return "listeners:token:{$token}";
    }

    /**
     * Issue a token and open a session. Called once, when someone presses play.
     */
    public function start(Station $station, Request $request, ?string $transport = null): ListenerSession
    {
        $token = Str::random(22);
        $now = now();
        $ip = $request->ip();
        $transport = $this->normaliseTransport($transport);

        $session = ListenerSession::create([
            'id' => $token,
            'station_id' => $station->id,
            'transport' => $transport,
            'country' => $this->geo->country($request),
            'device' => $this->agents->device($request->userAgent()),
            'browser' => $this->agents->browser($request->userAgent()),
            'referrer_host' => $this->referrerHost($request),
            'visitor_hash' => $this->geo->visitorHash($ip),
            'started_at' => $now,
            'last_seen_at' => $now,
        ]);

        $ttl = (int) config('analytics.max_session_hours', 12) * 3600 + 3600;

        Redis::setex($this->tokenKey($token), $ttl, "{$station->id}:{$transport}");
        Redis::zadd($this->liveKey($station->id, $transport), $now->timestamp, $token);

        return $session;
    }

    /**
     * Record a check-in. Returns false for a token we have never seen, or one
     * whose session has already been closed and swept.
     *
     * Note what is NOT here: no database write. At a thousand listeners this
     * runs four times a second per listener-minute, and persisting last-seen on
     * every one of them would be four thousand row updates a minute to store a
     * number that only matters when the session ends. The sweep writes it in
     * bulk instead, once a minute, for everyone at once.
     */
    public function beat(string $token): bool
    {
        $handle = $this->resolveToken($token);

        if ($handle === null) {
            return false;
        }

        Redis::zadd($this->liveKey(...$handle), now()->timestamp, $token);

        return true;
    }

    /**
     * Close a session because the listener said so — the player's unload
     * beacon. Distinct from the sweep's version only in that the end time is
     * NOW rather than the last check-in, because we have just been told the
     * listener was still there a moment ago.
     */
    public function end(string $token): bool
    {
        $handle = $this->resolveToken($token);

        if ($handle !== null) {
            Redis::zrem($this->liveKey(...$handle), $token);
            Redis::del($this->tokenKey($token));
        }

        $session = ListenerSession::query()->open()->find($token);

        if ($session === null) {
            return false;
        }

        $this->close($session, now());

        return true;
    }

    /**
     * Listeners on this station right now, across every transport.
     *
     * Read-only on purpose: this is the endpoint a public player page polls,
     * so it counts the live range rather than trimming the expired one. The
     * trimming is the sweep's job, once a minute, in one place.
     */
    public function liveCount(Station $station): int
    {
        // Written by `stations:sync-listeners`. Icecast reports a number, not
        // identities, so these listeners can be counted but never given a
        // session row — which is exactly why listening TIME is measured by
        // sampling this total once a minute rather than by summing sessions.
        $icecast = (int) (Redis::get("listeners:{$station->id}") ?: 0);

        // Only the HLS set is added. Listeners on the Icecast mount are
        // already inside the number above — they hold a socket, which is the
        // only reason that poll can see them at all — so adding their sessions
        // here would report every one of them twice. Their rows still earn
        // their keep: they carry country, device and duration, none of which
        // Icecast knows.
        $since = now()->timestamp - (int) config('analytics.live_window_seconds', 45);

        $hls = (int) Redis::zcount($this->liveKey($station->id, 'hls'), $since, '+inf');

        return $hls + $icecast;
    }

    /**
     * The transport to record when the player does not name one.
     *
     * @see config/analytics.php
     */
    public function playerTransport(): string
    {
        return $this->normaliseTransport(null);
    }

    /**
     * @return array{0: string, 1: string}|null [station id, transport]
     */
    private function resolveToken(string $token): ?array
    {
        $handle = Redis::get($this->tokenKey($token));

        if (! is_string($handle) || $handle === '') {
            return null;
        }

        // Tokens issued before transports were split carry a bare station id.
        // Reading them as HLS keeps sessions that were open across the deploy
        // beating into a real set instead of silently going nowhere.
        $parts = explode(':', $handle);

        return [$parts[0], $this->normaliseTransport($parts[1] ?? null)];
    }

    private function normaliseTransport(?string $transport): string
    {
        $transport ??= (string) config('analytics.player_transport', 'hls');

        return in_array($transport, self::TRANSPORTS, true) ? $transport : 'hls';
    }

    /**
     * Sessions that have gone quiet, with the timestamp of their last check-in.
     *
     * Read before removal, because that score is the only record of when the
     * listener was actually last there — take it out of the set first and the
     * session's end time is lost.
     *
     * @return array<string, float> token => last-seen unix timestamp
     */
    public function expiredTokens(string $stationId, CarbonInterface $before, string $transport = 'hls'): array
    {
        return Redis::zrangebyscore(
            $this->liveKey($stationId, $transport),
            '-inf',
            (string) $before->getTimestamp(),
            ['withscores' => true],
        );
    }

    /** Drop the quiet tokens from the live set once their sessions are closed. */
    public function forgetExpired(string $stationId, CarbonInterface $before, string $transport = 'hls'): void
    {
        Redis::zremrangebyscore($this->liveKey($stationId, $transport), '-inf', (string) $before->getTimestamp());
    }

    /** Tokens still checking in — used to refresh `last_seen_at` in bulk. */
    public function liveTokens(string $stationId, CarbonInterface $since, string $transport = 'hls'): array
    {
        return Redis::zrangebyscore($this->liveKey($stationId, $transport), (string) $since->getTimestamp(), '+inf');
    }

    /**
     * Write an end time and a duration onto a session.
     *
     * `seconds` is clamped at zero because a clock that steps backwards — NTP
     * correcting a drifting host — would otherwise produce a negative duration
     * that an unsigned column silently turns into an enormous one.
     */
    public function close(ListenerSession $session, CarbonInterface $endedAt): void
    {
        $seconds = max(0, $endedAt->getTimestamp() - $session->started_at->getTimestamp());

        $session->forceFill([
            'ended_at' => $endedAt,
            'last_seen_at' => $endedAt,
            'seconds' => $seconds,
        ])->save();
    }

    /**
     * Fold one concurrency sample into the station's hourly row.
     *
     * This is the whole of listening-time measurement. Because samples are one
     * minute apart, summing "how many people are listening right now" over an
     * hour yields listener-minutes directly — no session arithmetic, no
     * overlap replay, and it includes Icecast listeners who have no session
     * row to sum in the first place.
     *
     * One statement, MySQL-specific, so overlapping runs can never lose an
     * update to a read-modify-write race. The schedule already prevents
     * overlap; this makes the correctness independent of that.
     */
    public function recordSample(string $stationId, int $count, ?CarbonInterface $at = null): void
    {
        if ($count <= 0) {
            // Rows stay sparse: a minute with nobody listening writes nothing,
            // so a dormant station costs zero rows a day instead of 24 empty
            // ones. A missing row reads as zero.
            return;
        }

        $hour = ($at ? Carbon::parse($at) : now())->startOfHour()->toDateTimeString();

        DB::statement(
            'INSERT INTO listener_stats_hourly
                (station_id, hour, peak_listeners, listener_minutes, sampled_minutes)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
                peak_listeners   = GREATEST(peak_listeners, VALUES(peak_listeners)),
                listener_minutes = listener_minutes + VALUES(listener_minutes),
                sampled_minutes  = sampled_minutes + 1',
            [$stationId, $hour, $count, $count],
        );
    }

    /**
     * Hostname of the referring page, or null.
     *
     * Host only, never the path: a full referrer URL can carry search terms,
     * usernames, or session ids from whatever site linked here, and "reddit.com"
     * answers the only question anyone is asking of it.
     */
    private function referrerHost(Request $request): ?string
    {
        $referrer = $request->headers->get('referer');

        if (! is_string($referrer) || $referrer === '') {
            return null;
        }

        $host = parse_url($referrer, PHP_URL_HOST);

        return is_string($host) ? Str::limit(ltrim($host, '.'), 250, '') : null;
    }
}
