<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastTokenService;
use App\Services\IngestMetrics;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Liquidsoap harbor auth callback.
 *
 * A station's container calls this once per connection attempt, from the
 * `auth` function in its rendered .liq:
 *
 *   { slug, user, password, address }
 *
 * Returns 200 to allow, anything else to refuse. The container fails closed,
 * so a timeout or a 500 here rejects the broadcaster rather than admitting
 * them — this is the only thing standing between the open ingest port and
 * anyone who can reach it.
 *
 * TWO CREDENTIALS REACH THIS ENDPOINT, and they must not blur into one check:
 *
 *   • The BROADCAST TOKEN — short-lived, station-scoped, MAC-signed with
 *     APP_KEY, minted by BroadcastTokenController for the browser studio and
 *     valid for about a minute. Verified arithmetically, with no database
 *     read. Every plan has it; it is how a free account goes live.
 *
 *   • The STREAM KEY — the station's long-lived `stream_key` column, typed by
 *     hand into BUTT, Mixxx, RadioDJ or anything else speaking the Icecast
 *     source protocol. A database read and a constant-time comparison, and
 *     gated on the owner's plan.
 *
 * Order is token first, but NOT because it avoids a query — it does not. One
 * station lookup happens before either credential is judged, deliberately, so
 * that a token minted moments before its station was deleted or soft-deleted
 * is refused rather than waved through on arithmetic alone. (It once read
 * `->exists()` after the token verified; that let a deleted station's token
 * keep working.) The order that remains is between the two CHECKS: a MAC
 * verify before a decrypt, a constant-time compare and a plan read, so the
 * studio's hot path — every browser broadcast, plus every reconnect — does the
 * cheap thing first and stops.
 *
 * THE PLAN GATE LIVES HERE, not only in the UI. A Pro user who downgrades
 * keeps a key in their encoder's settings dialog, and the only moment we can
 * refuse it is the next time they connect — exactly how `embed_enabled` takes
 * an already-pasted embed dark. A broadcast already in flight is NOT cut off:
 * harbor authenticates when the socket opens and never again.
 *
 * Unlike the MediaMTX webhook this replaced, there is no station-start logic
 * here. Harbor lives *inside* the station container, so a broadcaster who can
 * reach it has already proven the container is up — and the studio starts the
 * station (through the plan-limit checks) before it ever opens the socket.
 */
class HarborAuthController extends Controller
{
    public function __construct(private IngestMetrics $metrics) {}

    public function __invoke(Request $request, BroadcastTokenService $tokens): Response
    {
        $data = $request->validate([
            'slug' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:2048'],
            'user' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);

        $slug = $data['slug'];
        $secret = (string) ($data['password'] ?? '');

        if ($secret === '') {
            return $this->refuse($slug, $data, 'no credential supplied', 'none');
        }

        // One lookup, reused by both paths below.
        //
        // The token path needs it because tokens are self-contained — no DB
        // read on verify — so one minted moments before the station was
        // deleted still MAC-validates. The key path needs the row itself.
        // `user.plan` is eager-loaded here rather than lazily in
        // canUseEncoder(): this runs once per connection attempt and the
        // second query would buy nothing.
        try {
            $station = Station::with('user.plan')->where('slug', $slug)->first();
        } catch (\Throwable $e) {
            // Fail closed on an unreachable database. The container already
            // fails closed on a timeout or a 500; answering 403 makes that
            // explicit and keeps the refusal reason in one place instead of
            // leaving the only record of it in an exception trace.
            Log::error('Harbor auth could not reach the database', [
                'station' => $slug,
                'error' => $e->getMessage(),
            ]);

            return $this->refuse($slug, $data, 'auth backend unavailable', 'none');
        }

        if ($station === null) {
            return $this->refuse($slug, $data, 'unknown station', 'none');
        }

        if ($tokens->verify($secret, $slug) !== null) {
            $this->metrics->allowed('token');

            return response('', Response::HTTP_OK);
        }

        if ($this->streamKeyMatches($station, $secret)) {
            if (! $station->user?->canUseEncoder()) {
                return $this->refuse($slug, $data, 'encoder broadcasting is not available on this plan', 'plan');
            }

            $this->metrics->allowed('key');

            return response('', Response::HTTP_OK);
        }

        return $this->refuse($slug, $data, 'invalid or expired credential', 'unknown');
    }

    /**
     * Constant-time comparison against the station's own key.
     *
     * The column is `encrypted`, so reading it decrypts — and a station whose
     * ciphertext no longer decrypts (APP_KEY was rotated) throws out of the
     * cast. That must be a refusal, not a 500: a 500 here is indistinguishable
     * from a refusal to the broadcaster but fills Sentry with noise on every
     * reconnect attempt of every station, and the honest answer is the same
     * either way — this credential does not open this station.
     */
    private function streamKeyMatches(Station $station, string $secret): bool
    {
        try {
            $key = (string) ($station->stream_key ?? '');
        } catch (\Throwable $e) {
            Log::warning('Could not read a station stream key', [
                'station' => $station->slug,
                'error' => $e->getMessage(),
            ]);

            return false;
        }

        if ($key === '') {
            return false;
        }

        return hash_equals($key, $secret);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string  $method  Which credential was being judged, from
     *                          {@see IngestMetrics::METHODS}. The first thing
     *                          any support conversation needs, and the reason
     *                          this is a field rather than prose in the
     *                          message — it is also a Prometheus label.
     */
    private function refuse(string $slug, array $data, string $reason, string $method): Response
    {
        // Info, not warning: a broadcaster whose token expired mid-reconnect
        // trips this routinely and it is self-correcting.
        //
        // `address` IS NOT THE BROADCASTER'S IP ON THE ENCODER PATH, and the
        // difference is easy to miss because it is on the studio path. The
        // studio arrives through the router's http block, which sets
        // X-Real-IP/X-Forwarded-For precisely so this field means something.
        // An encoder arrives through the `stream` block, which splices raw TCP
        // with no PROXY protocol — harbor reports the socket peer, which is
        // the station-router container's bridge address, the same one for
        // everybody.
        //
        // So a leaked-key incident is a wall of refusals all attributed to one
        // 172.x address, and `address` cannot separate one DJ's typo from an
        // attacker. Left as is rather than papered over: harbor speaks the
        // Icecast source protocol, not PROXY, so prepending a PROXY header
        // would corrupt the very first thing it parses. Recovering the real
        // address needs the router to carry it out of band, which is a change
        // to harbor's side too — worth doing when an incident calls for it,
        // not worth a half-measure that makes this field look trustworthy.
        //
        // NEVER LOG THE CREDENTIAL. `user` and `address` only — a stream key
        // is long-lived, so unlike an expired token a log line holding one
        // would outlive every rotation. The same applies to Sentry: this
        // request body carries the key in its `password` field, and it stays
        // out of events because `send_default_pii` is off (config/sentry.php).
        // Turning that on would start shipping this payload.
        $this->metrics->refused($method);

        Log::info('Harbor auth refused a publisher', [
            'station' => $slug,
            'user' => $data['user'] ?? null,
            'address' => $data['address'] ?? null,
            'method' => $method,
            'reason' => $reason,
        ]);

        return response($reason, Response::HTTP_FORBIDDEN);
    }
}
