# Realtime station events — implementation plan

Pushes the six container lifecycle events that move something on screen straight
to the dashboard over a WebSocket, so a power transition or a DJ connecting
appears immediately instead of on the next poll.

Status: **built, uncommitted (2026-09-19).** Phases 1–5 are implemented; Phase 0
was skipped and Phase 6 (Reverb) is still future work. Where this document and
the code disagree, the code and its comments win — the notable differences are
marked *As built* below.

The event inventory this builds on — every callback the container makes, what
Laravel does with each, and which of them the browser can currently see — is in
the Station Event Path doc: <https://claude.ai/artifact/GWs8M4ksJzzQGRfogc8HjB>

---

## What this does not do

**It does not delete the polling.** Three things have no producer and never
will, so the poll survives as the reconcile layer underneath:

1. **The audio graph going ready.** Nothing calls back when Liquidsoap finishes
   building its graph. `starting → on_air` is discovered by pulling.
2. **A container that dies.** `docker kill`, an OOM, a host reboot — none fire
   `shutdown`. The absence of an event is not an event.
3. **`elapsed`, `remaining`, `up_next`, `playlist_length`.** These exist only on
   the container-pull path. No event carries them and no Redis key holds them.

This matches what `StationEventController` already says about itself: the events
are "a fast path, never a source of truth". Losing one must cost freshness, not
strand a station. A socket that drops must degrade to today's behaviour, not to
a wrong screen.

**It does not change any storage.** Redis keys, MySQL writes and the container
pull all stay exactly as they are. The only new thing is an extra consumer of
facts Laravel already has.

---

## Transport: Ably now, Reverb later

Reverb is the right destination — no connection ceiling, no message metering, no
vendor, and the nginx WebSocket work is already done and running in
`infra/native/nginx/gocast-stream.conf:38` for the studio's `/broadcast/{slug}`
socket. But it means owning a fourth daemon that holds live sockets, and the
first integration is not the moment to also be debugging systemd.

So: **Ably first, in Pusher compatibility mode.** Not Ably's own broadcaster.

This distinction is the whole reason the migration stays cheap:

| | Ably's official path | Pusher compatibility mode |
|---|---|---|
| Server package | `ably/laravel-broadcaster` | `pusher/pusher-php-server` |
| Client package | `@ably/laravel-echo` + `ably-js` (a **fork** of Echo) | `laravel-echo` + `pusher-js` |
| Channel naming | Ably namespaces (`public:channel1`) | Pusher conventions |
| Error codes | Ably's | Pusher's |
| Migration to Reverb | swap both packages, rewrite channel/error handling | flip env vars |

Reverb speaks the Pusher protocol, so the compatibility route means the client
bundle does not change packages at all when we move. The documented casualty of
mixing a Pusher client with Ably is that `broadcast()->toOthers()` stops
working — we never use it, because our events originate from container
callbacks, not from a browser socket. There is no originating client to exclude.

**Confirm before committing:** that Ably's Pusher endpoint is available on the
free plan and counts messages the same way. Not verified here.

### The free-tier shape to design within

Ably free is 6M messages/month, **200 concurrent connections and 200 concurrent
channels**. Messages are not the constraint — publishing only the six lifecycle
events is roughly 600/station/month, so 6M is ~10,000 stations. The ceiling is
200 people with a dashboard open at once, and it is a hard rejection rather
than a slowdown.

Two design consequences, both of which are free headroom once we are on Reverb:

- **One channel per user, not per station.** Carrying station events and the
  notification bell on the same channel halves concurrent channel usage, and an
  owner watching three stations still costs one channel.
- **Do not broadcast track changes.** `now_playing` at one event per ~3.5min per
  station is ~12,300 messages/station/month and would be 95% of the bill for
  the least interesting update on the page. It stays on the poll.

---

## Phase 0 — Pace the existing poll (optional stopgap)

`intervalFor` in `client/hooks/useStationStatus.ts:36` paces an on-air station
at `POLL_STEADY_MS` (10s). Adding a faster pace while a station is on air with
no live source attached — the "waiting for a DJ" window — cuts the encoder-
connect lag from ~12s to ~5s.

**This is not free.** It is free in engineering time, not in request volume: an
idle on-air station running AutoDJ with nobody broadcasting would poll its
container roughly 3× as often, all day. That is the common case, not the rare
one.

Do this **only if Phases 1–4 are more than a week out.** Otherwise skip it —
Phase 4 makes it moot, and the current pacing is the right fallback behaviour
for when the socket is down.

The encoder panel already solves this properly for the case that matters most:
`EncoderView` polls at 2s and Radix unmounts it on close, so the fast poll
starts when the panel opens and stops when it closes
(`client/components/dashboard/GoLiveTrigger.tsx:296`).

---

## Phase 1 — Scaffolding

Laravel 13 ships none of this. There is no `config/broadcasting.php`, no
`routes/channels.php`, and no `->withBroadcasting()` in `bootstrap/app.php`.

```
php artisan install:broadcasting
composer require pusher/pusher-php-server
```

Decline the installer's offer to set up Reverb and Echo — we are using the
`pusher` driver against Ably, and the client is wired by hand in Phase 4.

`.env` / `api/.env.example` — replace the `BROADCAST_CONNECTION=log` at line 161:

```
BROADCAST_CONNECTION=pusher
PUSHER_APP_ID=
PUSHER_APP_KEY=
PUSHER_APP_SECRET=
PUSHER_HOST=            # Ably's Pusher-protocol endpoint
PUSHER_PORT=443
PUSHER_SCHEME=https
PUSHER_APP_CLUSTER=
```

### 1.1 Trap: `/broadcasting/auth` is not on the API middleware stack

Our auth works because `UseAuthTokenCookie` is prepended to the **api** group in
`bootstrap/app.php` and turns the `token` cookie into a bearer header before
Sanctum sees it. `/broadcasting/auth` is registered outside that group, so the
cookie never becomes a bearer and **every private subscription 401s**.

Register it on the API stack:

```php
->withBroadcasting(
    __DIR__.'/../routes/channels.php',
    ['middleware' => ['api', 'auth:sanctum']],
)
```

The `api` group carries the `UseAuthTokenCookie` prepend, which is the point.

### 1.2 Trap: CORS does not cover it either

`api/config/cors.php:18` is `'paths' => ['api/*', 'sanctum/csrf-cookie']`.
`broadcasting/auth` matches neither, so the browser's preflight fails — and the
failure surfaces as a CORS error, which reads like a server misconfiguration
rather than the one-line omission it is.

```php
'paths' => ['api/*', 'sanctum/csrf-cookie', 'broadcasting/auth'],
```

`supports_credentials` is already `true`, which is what lets the `token` cookie
ride along on the auth request.

---

## Phase 2 — The broadcast event

### 2.1 The event class

`api/app/Events/StationStateChanged.php`, implementing `ShouldBroadcast`.

*As built:* the payload is a **signal, not a fact**. It carries only which
station changed and when; the client refetches `GET /stations/{slug}/status`
on receipt, so there is no second copy of `StationStatusService::state()` in
TypeScript to keep in step:

```php
[
    'slug'  => $station->slug,
    'event' => $event,   // the container's own vocabulary, plus started/stopped/reconciled/audio_started/audio_stopped
    'at'    => now()->toIso8601String(),
]
```

`at` is not decoration. WebSocket delivery is ordered per channel but a
reconnect can deliver a stale event after a fresher poll has already landed, so
the client discards anything older than the state it holds.

### 2.2 Queued, not `ShouldBroadcastNow`

Tempting to reach for `ShouldBroadcastNow` on a latency project. Don't.

`ShouldBroadcastNow` publishes inline, inside the request. That request is the
container's `POST /internal/station-event`, served by a php-fpm pool with
`pm.max_children = 12` (`infra/native/php/gocast.pool.conf:34`). A slow or
unreachable Ably would hold workers open, and twelve of them is the entire
API — including `harbor-auth`, which gates ingest. A broadcasting outage would
become an ingest outage.

Queued costs Redis queue latency, typically well under a second, against a
current worst case of twelve. `gocast-queue.service` already runs the worker.

### 2.3 The publish point

`api/app/Http/Controllers/StationEventController.php`, in `__invoke`, after the
side effects and before the `Log::info` at line 146. One place, all nine events:

```php
if (in_array($validated['event'], self::BROADCAST_EVENTS, true)) {
    StationStateChanged::dispatch($station, $validated['event']);
}
```

`BROADCAST_EVENTS` is the six that move something on screen. *As built:*

`shutdown`, `icecast_connected`, `icecast_disconnected`, `icecast_error`,
`live_connected`, `live_disconnected`.

Deliberately excluded: `boot` (fires before the audio graph is ready, so the
station reads as `starting` both before and after it; `icecast_connected` is
what ends the boot). `live_silent` / `live_audio` were also excluded while
they existed; they went with the dead-air guard on 2026-09-19. `icecast_error` is
included because the template sets `ice_up := false` in `on_error` exactly as
in `on_disconnect`, so it produces the same `degraded` state.

Two producers the original plan did not have: `stations:reconcile` broadcasts
`reconciled` when it restarts or recreates a dead container (the only producer
for a container that died), and `NowPlayingController` broadcasts
`audio_started` / `audio_stopped` on the transition in and out of the silence
bed — never on a track change, which stays on the poll.

Also dispatch from `StationLifecycleService` at the `started` (line 104) and
`stopped` (line 257) records, so a power press from another tab or the admin
panel reaches an open dashboard too.

---

## Phase 3 — Channel and authorization

`routes/channels.php`:

```php
Broadcast::channel('user.{id}', function (User $user, int $id) {
    return $user->id === $id;
});
```

One private channel per user, carrying station events for every station they
own plus the notification bell. `StationStateChanged` routes to
`new PrivateChannel('user.'.$station->user_id)`.

**Why not per-station.** A per-station channel is the more obvious model and
would let `StationPolicy@view` do the authorization directly, as
`StationStatusController` does. It costs one channel per station being watched
plus one for the bell, which is double the concurrent channels against a
200-channel free ceiling. Revisit on Reverb, where the ceiling is gone and
per-station channels are tidier.

Note this makes the channel owner-scoped: an admin viewing someone else's
station in the panel does not get pushes. Out of scope.

---

## Phase 4 — The client

### 4.1 Packages and env

```
npm i laravel-echo pusher-js
```

`client/lib/env.ts` needs literal getters for each new variable. The file's own
docstring explains why a loop or dynamic lookup will not work: Turbopack does
static string replacement at compile time and cannot inline dynamic keys.

Add `NEXT_PUBLIC_BROADCAST_AUTH_URL` as its own variable rather than deriving it
from `apiUrl` — `apiUrl` already includes `/api`, and `/broadcasting/auth` is a
sibling of it, not a child. String surgery on a URL that differs per environment
is how the hybrid dev mode breaks.

### 4.2 The Echo singleton

`client/lib/echo.ts`. Constructs once, browser-only (`typeof window`), and
returns `null` when the key is unset — which is the kill switch in Phase 7.

```js
authEndpoint: env.broadcastAuthUrl,
auth: { withCredentials: true },
```

`withCredentials` is what sends the `token` cookie that `UseAuthTokenCookie`
converts. No header injection needed.

### 4.3 `useStationStatus` becomes push-with-reconcile

The hook keeps everything it has. Added on top:

- Subscribe to `private-user.{id}`, filter on `slug`.
- On an event, merge the pushed fields and reset the poll timer — a push is
  also evidence that the state is current, so the next poll can be deferred.
- Discard any event whose `at` is older than the currently held state.
- While the socket reports connected, raise the steady interval from 10s to
  30s. On `disconnected`, restore today's pacing immediately.

That last rule is the whole safety story: if Ably is down, or the tab has no
network, or the key is unset, the hook behaves exactly as it does today. The
reconcile poll is not a fallback bolted on — it is the existing code path, left
running slower.

Keep the existing `visibilitychange` pause. A hidden tab should not hold a
subscription doing nothing either; unsubscribe on hide, resubscribe and force an
immediate poll on show.

### 4.4 The bell

`useNotifications` moves onto the same channel, replacing the 60s
`/notifications/unread-count` poll. Same reconcile rule: keep a slow poll as
backstop.

---

## Phase 5 — Consolidate the listener polls (independent)

Not part of the realtime work and shippable on its own. It is the largest raw
request reduction available and needs no infrastructure at all.

Four separate timers poll `/public/stations/{slug}/listeners`, at 8s or 10s
depending on which was written when:

| Timer | Surface | Interval |
|---|---|---|
| `useBroadcastStats` | studio | 8s |
| `useListenerCount` | station overview | 8s |
| `PlayerView` inline | public station page | 10s |
| `EmbedPlayer` inline | embed iframe | 10s |

Fold all four onto one shared hook with one cadence.

Separately: **only `useStationStatus` and `useNotifications` listen for
`visibilitychange`.** The other seven network polls run forever in a background
tab. The public station page is the one that scales with listeners rather than
owners, so it is the one where this actually costs something.

---

## Phase 6 — Reverb migration (later)

When the 200-connection ceiling gets close, or when the vendor stops being
worth it.

```
composer require laravel/reverb
php artisan reverb:install
```

- Env: `BROADCAST_CONNECTION=reverb`, `REVERB_*` in place of `PUSHER_*`.
- Client: Echo's `broadcaster: 'reverb'`, same packages.
- `infra/native/systemd/gocast-reverb.service` — copy `gocast-queue.service`.
- nginx: copy the `$connection_upgrade` map and upgrade headers from
  `gocast-stream.conf:38`. This is already written and running.
- `setup-native.sh` renders the unit and vhost; `deploy-native.sh` restarts it.
- New host in `infra/native/env/domains.env.example`, or a location block on
  `API_HOST`.

Two traps:

- **`REVERB_HOST` vs `REVERB_SERVER_HOST`.** The server binds one, the browser
  connects to the other. Confusing them is the most common Reverb setup
  failure.
- **Hybrid dev mode.** The browser needs the LAN IP, not `localhost`, exactly
  like the `allowedDevOrigins` and API URL traps already documented for LAN
  device testing.

Deploys restart the daemon and drop every connected dashboard. Echo reconnects
on its own; the state resync is the Phase 4 reconcile poll, which is why that
has to be right before this phase, not after.

---

## Test plan

Targeted files only — the API suite takes minutes.

**`api/tests/Feature/StationEventBroadcastTest.php`** (new)

- Each of the six broadcast events dispatches `StationStateChanged`.
- `live_silent` and `live_audio` do not (they have since been retired
  altogether and now 422 like any unknown event).
- An unknown event still 422s and dispatches nothing.
- The payload carries `slug`, `event`, `at` and nothing else.
- `live_connected` broadcasts *after* the StreamSession is opened, so a client
  that refetches on receipt sees the session.

**`api/tests/Feature/BroadcastAuthTest.php`** (new)

- A user authorizes `user.{own id}`.
- A user is rejected for another user's id.
- The endpoint accepts the `token` cookie, not just a bearer header — this is
  the Phase 1.1 trap, and it is the one most likely to regress silently.

**Must still pass:** `StationStopClearsNowPlayingTest`, `LiquidsoapTemplateTest`.

**Manual:** connect BUTT to a live station with the dashboard open on the
overview page, not the encoder dialog. The power badge should flip without
waiting for a poll. Then kill the network, connect again, and confirm the badge
still updates within the reconcile interval.

---

## Sequencing and effort

| Phase | Effort | Notes |
|---|---|---|
| 0 — poll pacing | 1h | Optional; skip unless 1–4 slip past a week |
| 1 — scaffolding | 2–3h | Most of it is the two auth traps |
| 2 — the event | 3–4h | |
| 3 — channel | 1h | |
| 4 — client | 1 day | The real work |
| 5 — consolidation | 3–4h | Independent, ship whenever |
| 6 — Reverb | 1 day | Later |

Phases 1–3 can ship to production **dark**: with `BROADCAST_CONNECTION=log`,
every `broadcast()` writes a log line and nothing else. The server side can be
merged, deployed and watched before any client subscribes.

---

## Deploy, kill switch, rollback

**Kill switch, client:** `client/lib/echo.ts` returns `null` when
`NEXT_PUBLIC_PUSHER_KEY` is unset, and every hook falls through to its existing
polling path. Unsetting one env var reverts the entire feature with no code
deploy.

**Kill switch, server:** `BROADCAST_CONNECTION=log` stops publishing. Events
still dispatch and still queue; they just go nowhere.

Both are independent, so a client problem and a server problem have separate
switches.

**Rollback:** neither switch requires a migration or a container relaunch.
Nothing in this plan touches the Liquidsoap template, so no station needs
recreating — unlike the encoder ingest work, this is entirely above the
container boundary.

---

## Out of scope

- **`elapsed`, `remaining`, `up_next`** — no producer exists. Poll-only.
- **Container death detection** — needs a server-side watcher, not a transport.
- **A `ready` callback in the template** — would let us push
  `starting → on_air`, but it means relaunching every container. Separate work.
- **Web push / OneSignal** — solves "tell the owner when they are *not*
  looking", which is a different problem. Notably there is still no push channel
  at all: every class in `api/app/Notifications/` defines only `toMail`.
- **Presence** — who else is viewing a station. No use for it yet.
- **The `station-event:{id}` dead write.** `StationEventController:102` writes
  it with a 1h TTL and nothing in `api/` reads it. Worth deleting, but it is a
  separate cleanup and this plan does not depend on it either way.
