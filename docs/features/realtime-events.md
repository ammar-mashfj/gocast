---
feature: Realtime events and polling
verified: 2026-09-29 against 360c382 plus uncommitted work
sources:
  - api/routes/channels.php
  - api/config/broadcasting.php
  - api/config/cors.php
  - api/config/queue.php
  - api/config/liquidsoap.php
  - api/bootstrap/app.php
  - api/app/Events/StationStateChanged.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Http/Controllers/NowPlayingController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/ListenerCountController.php
  - api/app/Http/Controllers/NotificationController.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/StationStatusService.php
  - api/app/Console/Commands/ReconcileStations.php
  - api/app/Models/StationEvent.php
  - api/app/Providers/AppServiceProvider.php
  - api/routes/api.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Jobs/StopStation.php
  - api/config/notifications.php
  - api/composer.json
  - api/tests/Feature/BroadcastAuthTest.php
  - api/tests/Feature/StationEventBroadcastTest.php
  - api/.env.example
  - infra/native/systemd/gocast-queue.service
  - infra/native/deploy-native.sh
  - client/.env.example
  - client/lib/echo.ts
  - client/lib/env.ts
  - client/lib/broadcast.ts
  - client/contexts/RealtimeContext.tsx
  - client/contexts/StationContext.tsx
  - client/app/dashboard/layout.tsx
  - client/hooks/useStationStatus.ts
  - client/hooks/useNotifications.ts
  - client/hooks/useListenerCount.ts
  - client/hooks/usePublicStationStats.ts
  - client/hooks/useBroadcastStats.ts
  - client/components/dashboard/StationPower.tsx
  - client/components/dashboard/GoLiveTrigger.tsx
  - client/lib/broadcast.ts
  - client/components/homepage/heroSection/HeroStationPlayer.tsx
  - client/app/embed/[slug]/EmbedPlayer.tsx
  - client/app/station/[slug]/PlayerView.tsx
  - client/components/dashboard/LiveListeners.tsx
  - mobile/src/lib/station.ts
  - mobile/src/broadcast/hooks.ts
  - mobile/src/broadcast/BroadcastContext.tsx
  - mobile/src/app/station/[slug]/index.tsx
  - mobile/src/app/station/[slug]/audience.tsx
fingerprint: 5fad84a328d82856
---

# Realtime events and polling

GoCast has **one** push channel: a per-user private websocket channel that carries a content-free "something changed on station X, go look" signal to the **web dashboard only**. Everything else, including all of mobile, the public player, the embed and the notification bell, **polls**. Even on the dashboard the push is only an accelerator: the status poll keeps running underneath, at a slower pace while the socket is healthy.

The one thing people get wrong: the socket never carries state, and the poll is not a fallback that only runs when the socket is down. `station.state` payloads hold `slug`, `event` and `at`, nothing else. The dashboard reacts by re-calling `GET /stations/{slug}/status`. And three things (a container that dies, the audio graph becoming ready, track position) have no producer on the socket at all, so the dashboard polls even when the socket is perfect. The second wrong belief is that the bell is real time: it is a 60 second poll, and no Laravel notification class broadcasts (`grep` for `toBroadcast`, `BroadcastMessage`, `'broadcast'` channels in `api/app` finds nothing).

## What it actually does

### Server side: one event, one channel

`api/app/Events/StationStateChanged.php` is the only broadcast event in the app.

| Property | Value |
|---|---|
| Interfaces | `ShouldBroadcast` (queued) + `ShouldDispatchAfterCommit`; **not** `ShouldBroadcastNow` |
| Channel | `PrivateChannel('user.'.$userId)`, wire name `private-user.{id}`. One per account, not per station |
| Event name on the wire | `station.state` (`broadcastAs()`); Echo binds it as `.station.state` (leading dot = no namespace prefix) |
| Payload (`broadcastWith()`) | `{ slug, event, at }`, all strings. `at` is `Date::now()->toIso8601String()` stamped at dispatch (whole seconds) |
| Queue | `realtime` (`broadcastQueue()`) |
| Constructor | scalars only (`slug`, `userId`, `event`, `at`), no `SerializesModels`. Built through `StationStateChanged::for($station, $event)` |

The scalars matter because `stopped` and `shutdown` fire around deletion, and a re-hydrated model would throw `ModelNotFoundException` inside the worker.

`event` is the container's own vocabulary plus three server-made values. Complete list of dispatch sites (grep of `StationStateChanged::for` across `api/app`):

| Dispatched from | `event` value | When |
|---|---|---|
| `StationEventController::__invoke` | `shutdown`, `icecast_connected`, `icecast_disconnected`, `icecast_error`, `live_connected`, `live_disconnected` (the `BROADCAST_EVENTS` list) | After a Liquidsoap container POSTs its lifecycle event. Sent **last**, after the cache write, `StationEvent::record`, `last_ready_at` update, and `openSession`/`closeSessions`, so the client's refetch sees the session row |
| `StationEventController` | `boot` is **not** broadcast | It fires before the audio graph is ready, so the station reads `starting` before and after |
| `NowPlayingController::broadcastTransition` | `audio_started` / `audio_stopped` | Only when the Redis key `metadata:{station id}` goes from absent to present, or present to absent. A normal track change does **not** dispatch (that would be roughly one message per 3.5 minutes per station) |
| `StationLifecycleService::start` (about line 118) | `started` (`StationEvent::TYPE_STARTED`) | End of the start block, after the container is up and intent is saved |
| `StationLifecycleService::stop` (about line 278) | `stopped` (`StationEvent::TYPE_STOPPED`) | End of the stop block. Also fires when `stations:sweep` stops a silent station, so an open dashboard notices |
| `ReconcileStations` (two sites, about lines 208 and 283) | `reconciled` | The reconciler restarted a missing container, or recreated an unhealthy one. The only producer for a container that died |

The container-to-API path (`POST /internal/...` with `X-Internal-Key`, `throttle:internal` at 300/min per IP) is documented in [Station lifecycle](station-lifecycle.md) and [Liquidsoap station script](liquidsoap-station-script.md). `StationEventController` validates `event` against `StationEvent::CONTAINER_TYPES` (unknown gives 422, unknown station 404) before deciding whether to broadcast.

Why queued rather than inline: the container callbacks are served by php-fpm with a small worker pool. Publishing inline would hold a worker for as long as the broadcaster host takes to answer, and harbor-auth shares that pool. A broadcasting outage must not become an ingest outage.

### Authorisation

`api/routes/channels.php` declares exactly one channel: `Broadcast::channel('user.{id}', fn (User $user, string $id) => (string) $user->id === $id)`. Compared as strings (user ids are integers, the placeholder is a string).

`api/bootstrap/app.php` registers the auth route with `->withBroadcasting(channels.php, ['middleware' => ['api', 'auth:sanctum']])`, so `POST /broadcasting/auth` (a sibling of `/api`, not under it) runs through the `api` group, where `UseAuthTokenCookie` converts the browser's `token` cookie into the bearer header Sanctum reads. On the default `web` stack the cookie never becomes a bearer and every subscription 401s while every normal API call works. `api/config/cors.php` lists `broadcasting/auth` in `paths` (the `api/*` wildcard does not reach it) and relies on `supports_credentials`.

Consequence, stated in `channels.php`: the channel is **owner-scoped**. An admin looking at someone else's station gets no pushes and just polls (an admin-panel page has no socket anyway; the admin panel is server-rendered Blade, see [Admin panel](admin-panel.md)).

### Transport and config

The driver is Laravel's `pusher` driver pointed at Ably's Pusher-compatible host, not `ably/laravel-broadcaster`. Moving to Reverb is meant to be an env change (`api/config/broadcasting.php` comments).

| Variable | Where | Meaning |
|---|---|---|
| `BROADCAST_CONNECTION` | API | `log` (the default in `config/broadcasting.php` and `.env.example`) is the server kill switch: events still dispatch and queue, then write a log line. `pusher` turns it on. `phpunit.xml` forces `null` |
| `PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET` | API | The three pieces of the Ably key (`APP_ID.KEY_ID:SECRET`) |
| `PUSHER_HOST` (example `main.pusher.ably.net`), `PUSHER_PORT` (default 443), `PUSHER_SCHEME` (default `https`), `PUSHER_APP_CLUSTER` (default `mt1`, ignored by Ably) | API | `useTLS` is derived from scheme. HTTP `timeout` is hard-coded to 10 s |
| `NEXT_PUBLIC_PUSHER_KEY` | Web | Public half of the key. **Empty is the client kill switch**: `getEcho()` returns null and no socket opens |
| `NEXT_PUBLIC_PUSHER_HOST`, `NEXT_PUBLIC_PUSHER_PORT` | Web | Defaults `""` / 443 in `client/lib/env.ts`. `deploy-native.sh` defaults the host to `main.pusher.ably.net` |
| `NEXT_PUBLIC_BROADCAST_AUTH_URL` | Web | Full URL of `/broadcasting/auth`. Empty also disables the socket. `deploy-native.sh` derives it as `https://${API_HOST}/broadcasting/auth` |
| `REDIS_QUEUE_BLOCK_FOR` | API | Default 5. Makes the queue worker BLPOP instead of sleeping 3 s between polls when empty, so a broadcast is picked up immediately |

`realtime` has a worker of its own, `--queue=realtime` (`infra/native/systemd/gocast-realtime.service`); `gocast-queue.service` serves `default` and `gocast-analysis.service` serves `analysis`. A deployment without a `realtime` worker never sends a broadcast. No production worker serves two queues: with `block_for` set, a worker on `a,b` only looks at `b` after 5 s with nothing arriving on `a` (see Gaps and traps).

`StationEventController` broadcasts every container event in `BROADCAST_EVENTS`, repeats included. A refused Icecast source reports `icecast_error` every 5 s and each one is pushed; that is cheap on a dedicated worker. Skipping repeats was tried and dropped: a repeat of the last cached event is also what a real change looks like when the event in between was lost.

### Browser side

**`client/lib/echo.ts`** `getEcho()`: a per-tab singleton (module variable plus an `initialised` flag) so all hooks share one socket. Returns null on the server, or when key or auth URL is missing. Otherwise builds `new Echo({ broadcaster: 'pusher', Pusher, key, cluster: 'mt1', wsHost, wsPort, wssPort, forceTLS: true, enabledTransports: ['ws','wss'] })` with a hand-written `channelAuthorization.customHandler`: `fetch(authUrl, { method: 'POST', credentials: 'include', body: { socket_id, channel_name } })`. It is hand-written because pusher-js's built-in ajax auth cannot send cookies. A non-2xx response, or a body that is not JSON (`response.json()` throws), is passed to pusher-js as an error via the callback, so the channel errors while the shared socket stays up. Whether and when pusher-js retries the subscription is pusher-js behaviour, not read here. `echoConnected(echo)` is `connection.state === 'connected'`.

**`client/contexts/RealtimeContext.tsx`** `RealtimeProvider`: mounted once in `client/app/dashboard/layout.tsx` with `userId={user.id}` taken from the `user` cookie (not from the `/user` request). It subscribes `echo.private('user.'+userId)` (does nothing if `userId` is falsy), listens for `.station.state`, and fans the payload out to handlers held in a ref'd `Set` (so component mount/unmount never re-subscribes). It exposes `{ connected, onStationSignal }` through `useRealtime()`.

`connected` is deliberately strict: it is true only when the **private channel is subscribed** and the socket state is `connected`. `channel.subscribed()` sets it, `channel.error()` clears it, and any pusher `state_change` away from `connected` clears it. So a socket that is open but whose `/broadcasting/auth` returned 401 counts as **not connected**, and polling stays fast. Cleanup calls `echo.leaveChannel('private-user.'+userId)` (not `leave()`, not `disconnect()`).

Outside the dashboard (public player, embed, marketing, admin) `useRealtime()` returns null and every consumer polls normally.

### What each surface polls or subscribes to

| Surface | Mechanism | Endpoint | Interval / trigger |
|---|---|---|---|
| Web dashboard station power card, overview, library, schedule status, end-broadcast dialog, go-live trigger | Poll **plus** push (`useStationStatus`) | `GET /stations/{slug}/status` (auth, `throttle:120,1`) | See below |
| Web dashboard listener count (`LiveListeners`, only while on air), studio and mini-controller milestone/sparkline (`useBroadcastStats`) | Poll only (`usePublicStationFeed`) | `GET /public/stations/{slug}/listeners` (`throttle:public`) | 10 s; studio/mini-controller keep polling in a hidden tab |
| Web public player page, embed | Poll only (`usePublicStationFeed`) | same | 10 s, paused when the tab is hidden |
| Web homepage hero player | Poll only | same | 10 s, only while `playing` (and paused when hidden) |
| Web notification bell | Poll only (`useNotifications`) | `GET /notifications/unread-count` (`throttle:notification-poll`, 30/min per user) | 60 s |
| Web studio pre-flight | `ensureStationOnAir` in `client/lib/broadcast.ts` first `POST /stations/{slug}/start`, then polls until `ready` | `GET /stations/{slug}/status` | 1 s (`STATION_READY_POLL_MS`), up to 20 s (`STATION_READY_TIMEOUT_MS`; 8 s on a reconnect attempt), then publishes anyway. Independent of the push |
| Mobile station overview | Poll only (`useStationStatus` in `mobile/src/lib/station.ts`) | `GET /stations/{slug}/status` | 2 s / 10 s / 30 s, track-aware, see below |
| Mobile station overview listener count (`useListeners`, one call site in `station/[slug]/index.tsx`, shared by the hero and the stat tiles), and the on-air effect in `BroadcastContext` | Poll only | `GET /public/stations/{slug}/listeners` | 10 s. Overview: only while the station is running and this phone is not the broadcaster (live from this phone, the overview reads `broadcast.session.listeners` from the context's poll instead). Context: only while broadcast state is `live`/`reconnecting` |
| Mobile sessions list | Poll only (`useApiData`) | `GET /stations/{slug}/sessions` | 30 s |
| Mobile audience screen (`useApiData` with `60_000`) | Poll only | `GET /stations/{slug}/audience` | 60 s, skipped when the app is not `active` |
| Mobile everything else (library, schedule playlists, show times) | Fetch on screen focus, no interval | various | none |
| Mobile notifications | **Nothing.** No bell exists in `mobile/src` | | |

#### `useStationStatus` in detail (`client/hooks/useStationStatus.ts`)

Constants: `POLL_STARTING_MS = 2000`, `POLL_STEADY_MS = 10000`, `POLL_OFFLINE_MS = 30000`, `POLL_PUSHED_MS = 30000`, `SIGNAL_COALESCE_MS = 120`, `POLL_FLOOR_MS = 3000`, `TRACK_END_GRACE_MS = 750`, `POLL_MAX_BACKOFF_MS = 30000`.

Signature `useStationStatus(slug, enabled = true, intervalMs?)`; `enabled=false` runs no loop. Call sites: `StationPower`, `ScheduleStatus`, `LibraryView`, `EndBroadcast` (only while its dialog is open and AutoDJ is not locked), `GoLiveTrigger`. Each call is its own independent loop with its own timer (no shared registry, unlike the public feed), so a page mounting two of them makes two requests per cycle against `throttle:120,1`.

The loop is `await read(); setTimeout(tick, next)`, so requests never overlap. The next delay is chosen by `intervalFor(status, pushed)`, first match wins:

1. No status yet: 2 s.
2. `state === 'starting'`: 2 s, **even when pushed**. A container that dies while booting announces nothing.
3. `state === 'offline'`: 30 s.
4. Handover windows: `reachable && source==='live' && broadcaster===false` (show ended, buffer draining) or `reachable && broadcaster===true && source!=='live'` (connected, harbor still buffering): 2 s, even when pushed. These end without any signal (AutoDJ taking over is a title change, deliberately not pushed).
5. Otherwise `ceiling = pushed ? 30 s : 10 s`. If `remaining` is a number >= 0: `min(ceiling, max(3 s, remaining*1000 + 750))`, so the next read lands just after the track ends. If there is no `remaining` (live, silence bed): the ceiling.

Failure handling: a failed request returns a sentinel and the next delay is `min(30 s, 2 s * 2^(failures-1))`. Any success resets the counter. The last known status is kept on failure (the UI does not flash to unknown). `refresh()` flattens failure to null.

`intervalMs` override (fixed cadence): used by `GoLiveTrigger` with `WATCH_POLL_MS = 2000` to notice an encoder connecting. It applies **only while the socket is down**; when `pushed` is true the normal `intervalFor(next, true)` is used, because `live_connected` is pushed.

Signal handling: `onStationSignal` ignores other slugs, ignores a signal whose `at` string is **strictly older** than `lastSignalAt` (same-second signals are kept on purpose), ignores everything while `document.hidden`, and otherwise waits 120 ms (coalescing bursts) and calls `restart()`, which bumps a `generation` counter, clears the timer and ticks immediately. The generation counter stops an in-flight tick from scheduling a second loop.

Hidden tab: `tick()` skips the request when `document.hidden` (using the last status to pace) and `visibilitychange` to visible triggers an immediate `restart()`. `pushed` is an effect dependency: when the socket connects or drops, the loop restarts with an immediate read, which is the resync for anything missed while down. Nothing replays events.

Failure behaviour when the socket is down, in one place: `connected` is false, `pushed` is false, the status hook paces at 2 s / 10 s (track-aware) / 30 s exactly as it did before push existed, the GoLiveTrigger 2 s override applies again, and a reconnect triggers an immediate refetch. There is no error UI for a dead socket.

#### `usePublicStationStats` (`client/hooks/usePublicStationStats.ts`)

A module-scope registry `feeds: Map<slug, Feed>` gives one timer and one request per station per tab regardless of how many components subscribe. `POLL_MS = 10_000`. A late subscriber gets the held `latest` value at once. `pauseWhenHidden` defaults true; the timer is cleared while hidden, and on return an immediate read happens only if `Date.now() - readAt >= POLL_MS` (guards against alt-tab bursts against a 60/min public throttle). `useBroadcastStats` passes `pauseWhenHidden: false` (broadcasters alt-tab mid-show) and `enabled: isLive`. Failed or non-OK responses are swallowed and the last value kept. `useListenerCount` is a thin wrapper returning `count ?? null` (null means unknown, render nothing, not 0). `LiveListeners` passes `enabled = isOnAir`.

The endpoint (`ListenerCountController::show`) returns `count` (HLS live count computed per request plus Icecast count that `stations:sync-listeners` refreshes once a minute, so it moves in minute steps), `state`, `is_live`, `is_on_air`, `now_playing`. The public feed never uses the socket.

#### `useNotifications` (`client/hooks/useNotifications.ts`)

`POLL_MS = 60_000` for `GET /notifications/unread-count`. Starts on visible, stops on hidden, and on return only fetches if the last **attempt** (not success) is older than 60 s. Failures are silent and the previous badge stays. The feed (`GET /notifications`) is fetched only when the panel opens, every open. All mutations are optimistic with rollback and `mutationSeq`/`feedSeq` counters to discard stale responses. `capped_at` comes from the API (`config('notifications.unread_count_cap', 99)`). Full notification behaviour: [Notifications and email](notifications-and-email.md).

#### Mobile (`mobile/src/lib/station.ts`, `mobile/src/broadcast/*`)

No websocket, no Echo, no pusher in `mobile/`. `useStationStatus(slug)` is a simplified copy of the web loop with the web's constants duplicated by hand: next delay 10 s by default; 2 s when `state==='starting'` or in either handover window (mobile omits the web's `reachable &&` term); 30 s when `offline`; otherwise `min(10 s, max(3 s, remaining*1000+750))` when `remaining != null` (web requires a number `>= 0`); failures back off `min(30 s, 2 s * 2^(n-1))` and set `failed`. It runs only while the screen is focused (`useFocusEffect`) and re-polls on `AppState` returning to `active`; it does not stop its timer when the app goes to the background. `useApiData(path, pollMs?)` refetches on focus and, with `pollMs`, on an interval that skips when the app is not `active` (callers: sessions 30 s, audience 60 s). `useListeners` (`broadcast/hooks.ts`) and the on-air effect in `BroadcastContext.tsx` poll the public listeners endpoint every 10 s (`LISTENERS_POLL_MS`, defined separately in each file), the latter only while the broadcast state is `live` or `reconnecting`, so count and peak survive leaving the studio screen. The studio's transport health (`HEALTH_POLL_MS = 2000`) is a local read of socket stats, not an API call. Mobile studio broadcast reconnection is a different mechanism, see [Mobile studio and encoder](mobile-studio-and-encoder.md).

## Rules and invariants worth knowing

- **Nothing is load-bearing.** Losing a signal costs freshness only. The poll always runs. `StationEvent::record` swallows its own failures too (see [Observability and events](observability-and-events.md)).
- **State authority stays server-side.** The client has no copy of `StationStatusService::state()`; it only refetches.
- **Ordering.** `at` is the only staleness check, compared as a string. It is valid because Carbon's ISO-8601 output in one app timezone sorts lexicographically. It cannot order two events inside the same second.
- **The 2 second status cache** (`liquidsoap.status_ttl_seconds`, env `LIQUIDSOAP_STATUS_TTL`; 15 s for a Docker-confirmed-down container via `LIQUIDSOAP_STATUS_DOWN_TTL`) sits behind `/status`, so a burst of signals does not become a burst of harbor reads. `live_source` (open `StreamSession`) is queried fresh per request and is not in that cache. `StationStatusService::forget()` is called by `StationPowerController` (start, stop, skip) **after** `StationLifecycleService` returns, not by the service itself, and by no container callback, `StopStation` job or reconciler path.
- **Channel cost model.** One private channel per user was chosen for Ably's free tier (200 concurrent channels and 200 connections). A message per state change and one connection per open dashboard tab is the whole budget; track changes are excluded from broadcast on purpose.

## Gaps and traps

1. **`BROADCAST_CONNECTION=log` alone: the two `.env.example` files say it is not a rollback, but the code suggests it degrades harmlessly.** Both `.env.example` files claim a browser with the key still subscribes successfully and slows to 30 s. Laravel's `LogBroadcaster::auth()` returns nothing, so `/broadcasting/auth` answers an empty 200 body; the hand-written handler in `client/lib/echo.ts` calls `response.json()`, which throws, so the channel errors and `connected` stays false (fast polling continues, at the cost of a failing auth request per attempt). This is read from code, not run against a live Ably. Either way the clean switch-off is to unset `NEXT_PUBLIC_PUSHER_KEY` in the same deploy.
2. **Worker without `--queue=realtime` sends nothing.** No error; the queue just grows. `api/composer.json`'s `dev` script runs `queue:listen --queue=realtime,default,analysis`, so `composer dev` is fine (one shared listener is acceptable locally; see item 17); a hand-started `queue:work` with the default queue never delivers pushes. No docker-compose file in the repo starts a worker.
3. **Stale doc comments.** The `useNotifications` docblock says "the app has no Reverb or Pusher connection (BROADCAST_CONNECTION=log)": outdated, a connection exists, but the statement that the bell is poll-only is still true. `api/routes/channels.php` says the bell "moves onto this transport": future intent, not built.
4. **Hidden-tab pacing uses a stale status.** In `tick()` a hidden tab reuses the `status` captured when the effect last ran (the effect deliberately omits `status` from its deps). It only affects the pace of a loop that is not making requests, and a visibility change forces a fresh read, so it is harmless, but it is easy to misread. (If that stale status is null, the hidden loop ticks every 2 s doing nothing.)
5. **Signals ignored while hidden.** A signal arriving in a hidden tab updates `lastSignalAt` and is then dropped. On return the visibility handler reads anyway, so nothing is lost, but the ordering guard has already advanced past that signal.
6. **`at` string comparison** assumes a constant UTC offset. A timezone change of the API host between two events would misorder them. Not observed, not guarded.
7. **Refetch may see a 2 s old container answer.** After a signal, the 120 ms coalesce then `GET /status` can hit the Redis payload cached up to 2 s earlier (`StationStatusService::payload`). `StationPowerController` calls `forget()` for start/stop/skip, but only after the lifecycle service has already dispatched the (queued) event, so that race is narrow. No container callback (`StationEventController`), `NowPlayingController`, `StopStation` (sweep stop) or `ReconcileStations` path calls it. So after a `live_connected` push the refetch can hit a cached payload up to 2 s old (`liquidsoap.status_ttl_seconds`), and after `reconciled` a payload cached as confirmed-down can survive up to 15 s (`status_down_ttl_seconds`). Derived from the code, not measured.
8. **`live_connected`/`live_disconnected` do not fix the handover windows.** `intervalFor` still polls every 2 s during them even when pushed, because the audible switch (buffer fill or drain) happens seconds after the signal and is not announced. Removing those two branches would make the headline lag by up to 30 s.
9. **Admin viewing another user's station gets no push** by design (owner-scoped channel), and the admin panel has no socket regardless.
10. **Mobile does not honour any of this.** No push at all, so status latency is bounded by the 3 s to 10 s poll, and a phone left in the background is silent (Android pauses JS timers; `AppState` re-polls on resume). The mobile constants are a hand copy of the web's; changing one without the other makes them drift.
11. **No push for track changes, on purpose.** Now-playing on the dashboard is learned from the status poll timed off `remaining`. A live source or silence bed has no `remaining`, so its title and the silence exit rely on `audio_started`/`audio_stopped` and the poll ceiling (10 s unpushed, 30 s pushed).
12. **Public surfaces scale by listener count.** Every player page, embed and hero player runs its own 10 s poll (only while visible). The only rate limit is `throttle:public` on `/public/...`; `ListenerCountController` calls `StationStatusService::fetch` per request behind the 2 s cache.
13. **No client-side tests** for `useStationStatus`, `RealtimeProvider` or `useNotifications`; a search of `client` for test files mentioning them found none.
14. **`client/.env.local` has a non-empty `NEXT_PUBLIC_PUSHER_KEY`** in this checkout, so local `next dev` opens a socket to Ably while `api/.env.example` defaults the server to `log`. That is the mismatch in item 1; whether local status polling slows to 30 s depends on whether the empty auth body counts as a subscription (see item 1).
15. **Mobile and web disagree on the handover rule and on negative `remaining`** (see the Mobile section); the mobile copy has no `reachable` guard.
16. **Every status-loop call site polls separately.** There is no shared feed for `useStationStatus`, only for the public listeners feed.
17. **A worker shared with `realtime` starves its other queues.** Laravel's Redis queue blocks on the first queue for `block_for` (5 s) and only reaches the next after that long with nothing arriving; a job inside the window resets it. On 2026-10-10 Icecast refused stations at its 50-source limit, each retried every 5 s, and the resulting `icecast_error` broadcasts kept `realtime` from ever being quiet for 5 s: `default` (verification codes, emails, stop checks, then analysis) did not run for an hour while the worker was 97% idle. Fixed by giving each queue its own unit (`gocast-queue` for `default`, `gocast-realtime`, `gocast-analysis`); `queue:check-backlog` alerts the admin Telegram if any queue's oldest job waits past `queue.backlog_alert_seconds`.

## Tests

- `api/tests/Feature/BroadcastAuthTest.php`: owner authorised through the `token` cookie, another user's channel 403, guest 401, bearer header still works, CORS preflight on `/broadcasting/auth` returns credentials header. Runs with the `pusher` driver and dummy keys (the `log` driver's auth is a no-op).
- `api/tests/Feature/StationEventBroadcastTest.php`: broadcast list, `boot` excluded, unknown event and unknown station send nothing, payload is a signal, routes to the owner channel, queue is `realtime`, session opened before announce.
- `api/tests/Feature/NowPlayingControllerTest.php` (`audio_started`/`audio_stopped` only on transitions) and `api/tests/Feature/ReconcileStationsTest.php` (`reconciled` on restart/recreate; not dispatched otherwise). Not in `sources` because only their assertions on `StationStateChanged` were read.
- No tests for the start/stop dispatch sites in `StationLifecycleService` were located.

## History

- Design and rationale live in the docblocks of `StationStateChanged`, `channels.php` and `broadcasting.php`. The Ably free-tier limits behind the one-channel-per-user decision are quoted from those comments, not independently checked.
- Related docs: [Station lifecycle](station-lifecycle.md), [Notifications and email](notifications-and-email.md), [Listener analytics](listener-analytics.md), [Public player and embed](public-player-and-embed.md), [Deployment and infra](deployment-infra.md), [Configuration reference](configuration-reference.md).
