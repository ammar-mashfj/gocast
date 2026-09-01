<?php

namespace App\Console\Commands;

use App\Models\ListenerSession;
use App\Models\Station;
use App\Models\StreamSession;
use App\Services\ListenerAnalytics;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Once a minute: close the listeners who stopped checking in, and record how
 * many are still here.
 *
 * These two jobs live in one command because they are the same traversal over
 * the same Redis key, and splitting them would mean reading it twice and
 * risking two different answers about the same station in the same minute —
 * the mistake `stations:sweep` was created to undo on the container side.
 *
 * ORDER MATTERS inside each station:
 *
 *   1. Read the expired tokens WITH their scores. That score is the only
 *      record of when the listener was last actually there, and it is the end
 *      time the session gets. Remove them first and it is gone.
 *   2. Close those sessions.
 *   3. Remove them from the live set.
 *   4. Count what remains and fold it into the hourly rollup.
 *
 * Nothing here talks to a container, Icecast, or the network. Cost is a
 * handful of Redis calls per station plus one write per station that has an
 * audience, which is why it can afford to run every minute — and it must,
 * because the minute interval is what turns the per-minute concurrency sample
 * into listener-MINUTES. Change the schedule and that column changes meaning.
 */
class SweepListenerSessions extends Command
{
    protected $signature = 'listeners:sweep';

    protected $description = 'Close idle listener sessions and sample concurrent listeners into the hourly rollup';

    public function handle(ListenerAnalytics $analytics): int
    {
        $now = now();
        $idleBefore = $now->copy()->subSeconds((int) config('analytics.idle_close_seconds', 60));
        $liveSince = $now->copy()->subSeconds((int) config('analytics.live_window_seconds', 45));

        $closed = 0;
        $listeners = 0;

        // Every station, not just the running ones: a station taken off air a
        // moment ago still has sessions that must be closed, and its listeners
        // are exactly the ones whose sessions would otherwise hang open until
        // the max-session cap.
        foreach (Station::query()->get(['id']) as $station) {
            // Both transports: an Icecast-transport session is never added to
            // the live count, but it still has to be closed on time or its
            // recorded duration is a fiction.
            foreach (ListenerAnalytics::TRANSPORTS as $transport) {
                $expired = $analytics->expiredTokens($station->id, $idleBefore, $transport);

                if ($expired !== []) {
                    $closed += $this->closeExpired($analytics, array_map('floatval', $expired));
                    $analytics->forgetExpired($station->id, $idleBefore, $transport);
                }

                $this->refreshLastSeen($analytics->liveTokens($station->id, $liveSince, $transport), $now);
            }

            // Icecast listeners are folded in here, so listening time covers
            // the audience that never had a session row to sum.
            $count = $analytics->liveCount($station);
            $analytics->recordSample($station->id, $count, $now);
            $this->recordPeak($station, $count);

            $listeners += $count;
        }

        $closed += $this->closeOverdue($analytics, $now);

        $this->info("Closed {$closed} sessions, {$listeners} listeners live.");

        return self::SUCCESS;
    }

    /**
     * Bump the open broadcast's high-water mark with the sample just taken.
     *
     * This lives here, and not in `stations:sync-listeners` where it started,
     * because that command only ever knew the ICECAST count — it polls the
     * admin API and never sees the HLS sorted set. Every listener on our own
     * player was therefore missing from `peak_listeners`, which with the
     * default `player_transport` of 'hls' meant very nearly all of them: the
     * broadcasts page showed a peak of external Icecast clients while the
     * player page, reading liveCount() through a different endpoint, showed
     * the real number. Two figures for one audience, disagreeing — the same
     * shape of bug as the `total_listener_minutes` column that was dropped.
     *
     * Sampling it here also means the broadcast peak and the hourly rollup are
     * derived from THE SAME reading, so the two can never diverge. Splitting
     * one question across two schedules reasoning from different proxies is
     * exactly what `stations:sweep` was created to undo on the container side.
     *
     * The open session is the attribution: `whereNull('ended_at')` is "the
     * broadcast on air right now", so a broadcaster who reconnects starts a
     * fresh high-water mark and samples taken during AutoDJ land nowhere.
     * This is also why a listener needs no `stream_session_id` of their own —
     * the link is resolved at write time, once a minute, instead of being
     * stamped on every listener and going stale.
     *
     * A `<` comparison makes it one conditional UPDATE: no read-then-write
     * race, and no write at all in the common case.
     */
    private function recordPeak(Station $station, int $count): void
    {
        if ($count <= 0) {
            return;
        }

        StreamSession::query()
            ->where('station_id', $station->id)
            ->whereNull('ended_at')
            ->where('peak_listeners', '<', $count)
            ->update(['peak_listeners' => $count]);
    }

    /**
     * Close sessions whose tokens fell out of the live set, ending each one at
     * its own last check-in rather than at now — otherwise every session would
     * be credited with the idle minute it took us to notice it was gone.
     *
     * @param  array<string, float>  $expired  token => last-seen unix timestamp
     */
    private function closeExpired(ListenerAnalytics $analytics, array $expired): int
    {
        $closed = 0;

        // chunk() rather than one whereIn: a busy station losing a few thousand
        // listeners at once (its container stopped) would otherwise build a
        // single query with thousands of placeholders.
        foreach (array_chunk($expired, 500, true) as $batch) {
            $sessions = ListenerSession::query()->open()->find(array_keys($batch));

            foreach ($sessions as $session) {
                $analytics->close($session, now()->setTimestamp((int) $batch[$session->id]));
                $closed++;
            }
        }

        return $closed;
    }

    /**
     * Push `last_seen_at` forward for sessions that are still checking in.
     *
     * Nothing reads this column while a session is live — Redis is the
     * authority for that. It is written so that the DATABASE can stand alone
     * if Redis is ever flushed or lost: without it, every session open at that
     * moment would have no evidence it was ever alive and would sit open until
     * the max-session cap swept it hours later, holding a fiction of an
     * audience the whole time.
     *
     * One bulk update per 500 sessions, not one per listener.
     *
     * @param  array<int, string>  $tokens
     */
    private function refreshLastSeen(array $tokens, Carbon $now): void
    {
        foreach (array_chunk($tokens, 500) as $batch) {
            ListenerSession::query()
                ->open()
                ->whereIn('id', $batch)
                ->update(['last_seen_at' => $now]);
        }
    }

    /**
     * The backstop, and the reason this design survives losing Redis.
     *
     * Two kinds of session end up here. One is a tab left open on a desk,
     * beating faithfully for days — without a cap, a single listener quietly
     * contributes weeks of listening time to a station's totals. The other is
     * any session that was live when Redis was flushed, which has no token in
     * any set and would otherwise never be closed by anything.
     *
     * Both are ended at `last_seen_at`, which is honest in both cases: the
     * desk tab was genuinely last seen a minute ago, and the orphan was last
     * seen whenever the sweep last refreshed it.
     */
    private function closeOverdue(ListenerAnalytics $analytics, Carbon $now): int
    {
        $cap = $now->copy()->subHours((int) config('analytics.max_session_hours', 12));
        $idle = $now->copy()->subSeconds((int) config('analytics.idle_close_seconds', 60));

        $closed = 0;

        ListenerSession::query()
            ->open()
            ->where(fn ($q) => $q->where('started_at', '<', $cap)->orWhere('last_seen_at', '<', $idle))
            ->chunkById(500, function ($sessions) use ($analytics, &$closed) {
                foreach ($sessions as $session) {
                    $analytics->close($session, $session->last_seen_at);
                    $closed++;
                }
            });

        return $closed;
    }
}
