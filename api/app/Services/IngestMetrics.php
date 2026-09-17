<?php

namespace App\Services;

use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * Cumulative counters for broadcaster connection attempts.
 *
 * WHY THIS EXISTS. Everything else about a broadcast is visible after the
 * fact — a StreamSession row, a station event, an Icecast listener count. A
 * connection that was REFUSED leaves none of those: it is a log line inside a
 * container plus a log line in Laravel, and the only person who notices is the
 * DJ staring at "connection failed" with no idea why.
 *
 * External encoders make that much worse than it was. The studio retries
 * automatically and reports its own errors on screen; BUTT reports a number.
 * A key that stopped working after a plan change, a typo'd mount, or a station
 * left switched off are all the same event from the outside, and the first
 * sign we would otherwise have is a support email days later. A counter per
 * outcome makes the shape of the problem visible on a graph.
 *
 * Redis INCR, not a table. These are hot — one per connection attempt, and a
 * reconnecting encoder can produce several a second — and they carry no
 * detail worth querying. Prometheus handles the counter resetting to zero
 * when Redis is flushed; a row per attempt would be a write amplifier for
 * data nothing reads twice.
 *
 * NEVER THROWS. Same contract as StationEvent::record(): this is
 * observability, and the auth path it sits on decides whether someone gets on
 * air. A dead Redis must cost a gap in a graph, not a refused broadcaster.
 */
class IngestMetrics
{
    private const PREFIX = 'metrics:harbor-auth:';

    /**
     * The credential a connection was admitted on.
     *
     * - token — the studio's short-lived broadcast token. The hot path.
     * - key   — a station stream key, i.e. an external encoder.
     *
     * @var list<string>
     */
    public const ALLOWED_METHODS = ['token', 'key'];

    /**
     * Why a connection was refused.
     *
     * - plan    — a VALID stream key on an account whose plan no longer
     *             includes the encoder. The one refusal that is a billing
     *             event rather than a mistake, which is why it is its own
     *             series: somebody is trying to broadcast and being told no.
     * - unknown — a credential that matched nothing. A wrong password, a token
     *             that expired mid-reconnect, or someone probing the port.
     * - none    — no credential at all, an unknown station, or the database
     *             was unreachable. Mostly scanners.
     *
     * @var list<string>
     */
    public const REFUSED_METHODS = ['plan', 'unknown', 'none'];

    /**
     * Fixed lists rather than whatever the caller passes, because these become
     * Prometheus label values and an unbounded set there is the classic way to
     * blow up a time-series database.
     *
     * They are also disjoint on purpose. There is no `refused{method="key"}`:
     * a key that matches but is out of plan is `plan`, and a key that does not
     * match is indistinguishable from any other wrong password, so it is
     * `unknown`. Emitting the empty combinations would put four series that
     * can never move on every dashboard.
     *
     * @return array<string, list<string>>
     */
    private static function methodsByOutcome(): array
    {
        return ['allowed' => self::ALLOWED_METHODS, 'refused' => self::REFUSED_METHODS];
    }

    public function allowed(string $method): void
    {
        $this->bump('allowed', $method);
    }

    public function refused(string $method): void
    {
        $this->bump('refused', $method);
    }

    /**
     * Every counter, as [outcome][method] => count, with a zero for every
     * combination that has never happened.
     *
     * The zeros matter: a Prometheus series that only appears once it is
     * non-zero cannot be alerted on with `rate() > x` until the first time it
     * fires, which is exactly the moment you wanted the alert.
     *
     * @return array<string, array<string, int>>
     */
    public function snapshot(): array
    {
        $out = [];

        foreach (self::methodsByOutcome() as $outcome => $methods) {
            foreach ($methods as $method) {
                $out[$outcome][$method] = $this->read($outcome, $method);
            }
        }

        return $out;
    }

    private function bump(string $outcome, string $method): void
    {
        if (! in_array($method, self::methodsByOutcome()[$outcome] ?? [], true)) {
            return;
        }

        try {
            Redis::incr(self::PREFIX.$outcome.':'.$method);
        } catch (Throwable) {
            // Deliberately silent — see the class docblock.
        }
    }

    private function read(string $outcome, string $method): int
    {
        try {
            return (int) (Redis::get(self::PREFIX.$outcome.':'.$method) ?? 0);
        } catch (Throwable) {
            return 0;
        }
    }
}
