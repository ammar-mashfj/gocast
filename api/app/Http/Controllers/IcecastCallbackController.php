<?php

namespace App\Http\Controllers;

use App\Events\StationStateChanged;
use App\Models\Station;
use App\Models\StationEvent;
use App\Services\BroadcastSessions;
use App\Services\BroadcastTokenService;
use App\Services\IcecastAdmin;
use App\Services\IngestMetrics;
use App\Services\StationStatusService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Icecast's callbacks for stations on the relay path (Free, no container).
 *
 * On that path nothing of ours sits between the broadcaster and Icecast except
 * the relay, which never calls Laravel. So Icecast itself asks:
 *
 *   • auth()  — its url role, once per source login: may `slug` publish to
 *               this mount with this broadcast token? The relay logs in with
 *               user = slug, password = the token the studio was given.
 *   • event() — its source-connect / source-disconnect bindings, which open
 *               and close the StreamSession exactly as harbor's
 *               live_connected / live_disconnected do for a container.
 *
 * Pro containers never reach auth(): they log in as `source` with the fixed
 * password, which the static role ahead of this one in icecast.xml answers.
 * Their mounts do reach event() and are ignored there — their sessions come
 * from the container.
 *
 * AUTH IS ON EVERY BROADCASTER'S CRITICAL PATH, AND ICECAST ASKS ONE AT A
 * TIME. Measured in the relay lab: after a relay crash, 500 studios were all
 * back on air within 18 s at 20 ms per answer and 35 s at 50 ms. Keep it to
 * the MAC check and one indexed lookup.
 */
class IcecastCallbackController extends Controller
{
    public function __construct(private IngestMetrics $metrics) {}

    /**
     * Icecast reads only the headers: `icecast-auth-user: 1` admits the
     * source, anything else refuses it, and `icecast-auth-message` is what it
     * logs. Answered 200 either way — the refusal is in the header.
     */
    public function auth(Request $request, BroadcastTokenService $tokens): Response
    {
        $slug = (string) $request->input('user', '');
        $mount = (string) $request->input('mount', '');
        $token = (string) $request->input('pass', '');

        if ($slug === '' || $token === '' || ! preg_match('/^[a-z0-9-]{1,64}$/', $slug)) {
            return $this->refuse($slug, $mount, 'malformed login', 'none');
        }

        try {
            $station = Station::where('slug', $slug)->first();
        } catch (Throwable $e) {
            Log::error('Icecast auth could not reach the database', [
                'station' => $slug,
                'error' => $e->getMessage(),
            ]);

            return $this->refuse($slug, $mount, 'auth backend unavailable', 'none');
        }

        if ($station === null) {
            return $this->refuse($slug, $mount, 'unknown station', 'none');
        }

        // The mount the relay asked for must be this station's own. The relay
        // builds it from the slug, so a mismatch is a station whose mount
        // predates that rule — resolveIngestPath() never puts one on the
        // relay — or someone aiming a valid token at another mount.
        if ($mount !== $station->icecast_mount) {
            return $this->refuse($slug, $mount, 'mount does not belong to this station', 'unknown');
        }

        if (! $station->isRunning()) {
            return $this->refuse($slug, $mount, 'station is off', 'unknown');
        }

        if (! $station->usesRelay()) {
            return $this->refuse($slug, $mount, 'station is not on the relay path', 'unknown');
        }

        if ($tokens->verify($token, $slug) === null) {
            return $this->refuse($slug, $mount, 'invalid or expired credential', 'unknown');
        }

        $this->metrics->allowed('token');

        return response('', Response::HTTP_OK, ['icecast-auth-user' => '1']);
    }

    public function event(
        Request $request,
        BroadcastSessions $sessions,
        StationStatusService $statusService,
        IcecastAdmin $icecast,
    ): Response {
        $action = (string) $request->input('action', '');
        $mount = (string) $request->input('mount', '');

        $type = match ($action) {
            'source-connect' => StationEvent::TYPE_LIVE_CONNECTED,
            'source-disconnect' => StationEvent::TYPE_LIVE_DISCONNECTED,
            default => null,
        };

        if ($type === null || $mount === '') {
            return response('', Response::HTTP_OK);
        }

        // By slug (unique, indexed) rather than by the unindexed mount column;
        // the mount check below keeps it exact.
        $prefix = (string) config('relay.mount_prefix');
        $station = str_starts_with($mount, $prefix)
            ? Station::where('slug', substr($mount, strlen($prefix)))->first()
            : null;

        // Containers report their own sessions; a mount with no station is
        // the shared silence feed or a stray. Neither is ours to record.
        if ($station === null || $station->icecast_mount !== $mount || ! $station->usesRelay()) {
            return response('', Response::HTTP_OK);
        }

        if ($type === StationEvent::TYPE_LIVE_CONNECTED) {
            $changed = $sessions->open($station, 'browser', null);
        } elseif ($this->mountTakenAgain($icecast, $mount)) {
            // The studio is already back on a new source. Icecast sends
            // events one at a time, in order, but a backlog (a relay restart
            // reconnects every studio at once) can deliver this after the
            // reconnected studio has re-sent its title. Closing now would end
            // the live session and wipe that title; the new source's connect
            // event finds the session still open and keeps it.
            Log::info('Ignored a relay disconnect: the mount is live again', ['station' => $station->slug]);
            $changed = false;
        } else {
            $changed = $sessions->close($station);
        }

        // Only a session that really opened or closed goes on the timeline and
        // to the dashboard. An ignored disconnect, and the connect that follows
        // it into a session that never closed, are one seamless reconnect:
        // recording them would put a disconnect on the admin timeline and make
        // every dashboard refetch mid-show.
        if ($changed) {
            // The relay status is built from the session row, so drop the
            // cached one before the dashboard refetches in response to the
            // broadcast.
            $statusService->forget($station);

            StationEvent::record($station, $type, StationEvent::SOURCE_SYSTEM, ['via' => 'relay']);

            event(StationStateChanged::for($station, $type));
        }

        Log::info('Icecast reported a relay source event', [
            'station' => $station->slug,
            'event' => $type,
            'changed' => $changed,
        ]);

        return response('', Response::HTTP_OK);
    }

    /**
     * Does a source hold this mount right now? Unknown (Icecast could not be
     * asked) counts as no, which keeps the plain disconnect behaviour.
     */
    private function mountTakenAgain(IcecastAdmin $icecast, string $mount): bool
    {
        return isset(($icecast->liveMounts() ?? [])[$mount]);
    }

    private function refuse(string $slug, string $mount, string $reason, string $method): Response
    {
        // Info, not warning: a token expiring mid-reconnect lands here
        // routinely and corrects itself. Never log the token.
        $this->metrics->refused($method);

        Log::info('Icecast auth refused a relay publisher', [
            'station' => $slug,
            'mount' => $mount,
            'reason' => $reason,
        ]);

        return response('', Response::HTTP_OK, ['icecast-auth-message' => $reason]);
    }
}
