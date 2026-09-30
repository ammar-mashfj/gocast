---
feature: Station lifecycle (power, state model, auto-stop)
verified: 2026-09-29 against 360c382 plus uncommitted work
sources:
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/StationLifecycleException.php
  - api/app/Services/StationStatusService.php
  - api/app/Services/BroadcastStateService.php
  - api/app/Services/StationAudioPolicy.php
  - api/app/Enums/StationAudioVerdict.php
  - api/app/Console/Commands/SweepStations.php
  - api/app/Console/Commands/ReconcileStations.php
  - api/app/Console/Commands/RelaunchStations.php
  - api/app/Policies/StationPolicy.php
  - api/app/Models/StationEvent.php
  - api/app/Services/AutoDjProgramme.php
  - api/app/Observers/UserObserver.php
  - api/routes/admin.php
  - api/app/Jobs/StopStation.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Events/StationStateChanged.php
  - api/app/Models/Station.php
  - api/app/Models/StreamSession.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Observers/StationObserver.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/config/liquidsoap.php
  - api/routes/api.php
  - api/routes/console.php
  - api/bootstrap/app.php
  - client/hooks/useStationStatus.ts
  - client/interfaces/StationStatus.ts
  - client/components/dashboard/StationPower.tsx
  - client/components/studio/EndBroadcast.tsx
  - client/contexts/BroadcastContext.tsx
  - client/lib/broadcast.ts
  - client/contexts/RealtimeContext.tsx
  - mobile/src/lib/station.ts
  - mobile/src/broadcast/broadcastManager.ts
  - mobile/src/broadcast/BroadcastContext.tsx
  - mobile/src/app/station/[slug]/index.tsx
  - mobile/src/components/station/usePower.ts
  - mobile/src/components/studio/OnAir.tsx
  - mobile/src/app/live/[slug].tsx
  - mobile/src/app/account.tsx
fingerprint: 8a2cfa3321bb4307
---

# Station lifecycle

A station is a database row plus, when it is on, one Liquidsoap container. This feature is everything that turns that container on and off, decides what "on air" means, and decides when to switch a forgotten station off.

**The one thing people get wrong:** there is no stored "is live" or "is on air" flag. Three independent things are stored or observed and every user-facing state is derived from them per request:

1. `stations.desired_state` (`stopped` / `running`) is the owner's **intent**. Only `StationLifecycleService` writes it.
2. Docker holds the **actual** container. `LiquidsoapSupervisor` observes and changes it; `stations:reconcile` closes the gap.
3. Whether a human is broadcasting is the presence of an **open `stream_sessions` row** (`ended_at` null), opened and closed by the container's own `live_connected` / `live_disconnected` callbacks. The old `stations.is_live` column was dropped (`2026_08_16_140000_drop_is_live_from_stations_table.php`).

"On air" therefore means "the owner asked for it to run", not "audio is flowing". A running station playing silence is `on_air`. The real audio facts (ready, Icecast connected, broadcaster attached, output level) come only from the container over harbor HTTP.

Boundaries: how the container is built and run is [Liquidsoap supervisor](liquidsoap-supervisor.md); what the `.liq` does with sources is [Liquidsoap station script](liquidsoap-station-script.md); what plays when nobody is live is [AutoDJ](autodj.md); the browser broadcast itself is [Broadcasting web studio](broadcasting-web-studio.md) and [Encoder ingest](encoder-ingest.md); the websocket transport is [Realtime events](realtime-events.md); the timeline rows are [Observability and events](observability-and-events.md).

## The state model

### Intent (`Station::desired_state`)

`Station::STATE_STOPPED` (default at creation, set in `Station::booted()` and the column default) or `Station::STATE_RUNNING`. `Station::isRunning()` is only this column. `Station::scopeRunning()` selects on it. `started_at` is set when a stop-to-run transition happens and nulled on stop. `silent_since` and `last_ready_at` are described under Data.

### Derived state (`StationStatusService::state()`)

Five strings, not four. `StationStatusService::STATE_*`:

| State | Rule (in order) |
|---|---|
| `offline` | `desired_state` is not `running`. Also: running, but the container did not answer harbor and `docker inspect` says it is not `running` (gone, exited, restarting). |
| `starting` | Running, harbor did not answer but Docker says the container is up; or harbor answered with `ready: false`. |
| `degraded` | Ready, but the container reports `icecast === false` (mount not carried: rejected source, Icecast restart, partition). `icecast` null (older container) is treated as fine. |
| `live` | Ready, Icecast ok, and harbor `source === 'live'`. |
| `on_air` | Ready, Icecast ok, any other source (`autodj`, `silence`, unknown). |

Consequences worth knowing:

- `live` here follows `source`, which lags the socket connecting by the live arm's buffer and describes which arm feeds the encoder. The **question "is somebody broadcasting?"** is answered by the separate `broadcaster` field (`StationStatusController`), which flips the instant harbor accepts the connection. The dashboard headline uses `broadcaster`, the `state` string does not.
- A container that is running but crash-looping reads `offline`, not `starting` (deliberate; the owner presses start). `probeContainer()` uses `containerState()['status'] === 'running'`, so `restarting` is not "up".
- If Docker itself is unreachable, `probeContainer()` returns true (a tooling fault is not evidence about the station), so harbor is dialled anyway.

### The cheap coarse state (`StationResource`)

List and show endpoints (`StationResource::toArray`) never call the container. They return `state` as only three values: `offline` (not running), `live` (running and an open stream session), `on_air` (running otherwise). `is_live = isRunning && open session`. `is_on_air = isRunning`. `starting` and `degraded` exist only on `GET /stations/{slug}/status`. `now_playing` on the resource comes from the Redis key `metadata:{station id}` and is null when the station is not `running` or the payload has neither title nor artist. `StationResource::collection()` batches the Redis and open-session lookups for lists.

### Broadcast activity

`Station::isLive()` / `scopeLive()` = an open `StreamSession` exists. `stream_sessions` columns used here: `started_at`, `ended_at`, `source_type` (`browser` / `external` / `electron`), `client` (broadcaster's user-agent, may be null), `peak_listeners`. Only human broadcasts create rows. AutoDJ time creates none.

## What the endpoints do

All under the `verified` middleware group in `api/routes/api.php`; all authorize `update` on the station (status: `view`). `StationPolicy` makes both owner-only (`user_id` match), so there is no admin or shared-access path.

| Route | Throttle | Controller | Result |
|---|---|---|---|
| `POST /stations/{slug}/start` | 20/min | `StationPowerController::start` | 202 + `StationResource` |
| `POST /stations/{slug}/stop` (body `force` boolean) | 20/min | `StationPowerController::stop` | 200 + `StationResource` |
| `POST /stations/{slug}/skip` | 30/min | `StationPowerController::skip` | Sends telnet `<LIQ_SOURCE>.skip`; 409 `station_not_running` if stopped; 503 `station_unreachable` if telnet fails |
| `GET /stations/{slug}/status` | 120/min | `StationStatusController` | Live status (below) |

Neither start nor stop waits for audio. Both call `StationStatusService::forget()` (drops the cached status) before responding. The client then polls status for readiness. Refusals are JSON `{message, code}`: 422 `station_limit_reached`, 503 `station_start_failed`, 409 `station_is_live` / `station_is_live_external`. `skip` has no lock and does not touch `desired_state`.

### `StationLifecycleService::start($station, $reason = 'owner')`

Under a per-station cache lock (`station-lifecycle:{id}`, TTL 30 s, waits up to 8 s: `LOCK_TTL_SECONDS`, `LOCK_WAIT_SECONDS`). Steps:

1. Refresh the row. If desired state is running **and** `supervisor->isRunning()`, return untouched (no restart, no event, no log). This is what makes a double click, and the studio's start-before-broadcast, safe: `LiquidsoapSupervisor::up()` restarts a running container, which drops every listener.
2. If desired state is not running: `assertCanRunAnother()` then write `desired_state = running` and `started_at = now()`.
3. `PlaylistFileWriter::write()` (jingle m3u), then `supervisor->up()`. Intent is saved **before** the container is touched so a failed `docker run` leaves the station `running` and the reconciler retries.
4. `Log::info`, `StationEvent::TYPE_STARTED` with `reason`, then `event(StationStateChanged::for(..., 'started'))`. A start of a station that is `running` with its container down therefore records a second `started` event.

Plan gate: `assertCanRunAnother()` counts the user's **other** stations with `desired_state = running` against `plan->max_running_stations` (`?? 1` when no plan). Over the limit throws `station_limit_reached` (422). Migration `2026_08_15_115900_add_feature_columns_to_plans_table.php` seeds free = 1, pro = 5 (plans can be edited later in the admin panel; read the plans table for today's values). Intent is counted, not containers: a crashed station still holds its slot. A start of a station that is already `running` but whose container is down skips the check and just re-runs `up()`.

If the container dies within `liquidsoap.start_verify_delay_ms` (750 ms) of `docker run`, `LiquidsoapSupervisor::verifyStarted()` throws `station_start_failed` (503; message "ran out of memory while starting" when Docker says OOM-killed). Intent is already saved, so the station stays `running`, and steps 3-4's event/log/broadcast are skipped for that attempt. `bootstrap/app.php` renders `StationLifecycleException` as JSON `{message, code}` with its status and reports only status >= 500.

### `StationLifecycleService::stop($station, $force = false, $reason = 'owner', $cutExternal = false)`

Same lock. Steps, in this order (the order is load-bearing, see the docblock comments):

1. If not `$force` and the station has an open stream session: read the open session's `source_type`/`client`. Refuse with `StationLifecycleException::liveBroadcast()` (409) unless `$cutExternal && source is external`. Codes: `station_is_live` (browser broadcaster; message "End the broadcast before taking it off air.") and `station_is_live_external` (encoder; offers "cut the broadcast off from here"). A cut-off records reason `owner_cutoff`. The decision is made inside the lock on purpose: the controller only passes the owner's `force` flag as `cutExternal`.
2. Write `desired_state = stopped`, `started_at = null`.
3. Close **every** open stream session (`ended_at = now()`), before `supervisor->down()`, because `down()` can throw and a stopped station with an open session is unrecoverable (reconcile only sweeps `running()->live()`).
4. `supervisor->down()` (removes the container; no-op in test mode).
5. `Redis::del("metadata:{id}")` so a stopped station does not keep reporting a track.
6. Log, `StationEvent::TYPE_STOPPED` (`reason`, `forced`), `StationStateChanged` `stopped`.

`silent_since` is **not** cleared here (see Gaps). `$force = true` skips the live guard entirely; no caller in the repo passes it (`StationPowerController` passes only `cutExternal`, the job passes neither). It is effectively reserved for future admin tooling. `stop()` also stops a station that is not `running` without complaint: it re-runs steps 2-6 (another `stopped` event and broadcast).

`autoDjEnabled()` / `assertAutoDjEnabled()` are plan helpers also used by `StationController` and `TrackController` (`autodj_not_available`, 403); they delegate to `User::canUseAutoDj()` (`plan->autodj_enabled`, false without a plan).

### Implicit start from the studios

The web studio (`client/lib/broadcast.ts` `ensureStationOnAir`) and the mobile studio (`mobile/src/broadcast/broadcastManager.ts` same-named method) call `POST /start` themselves before connecting, then poll `/status` until `ready` (web 20 s, then publishes anyway; reconnect attempts wait 8 s). A 422 or 403 from start becomes the broadcast's error message. They do this on **every reconnect attempt**, which is how a station stopped for silence while the DJ was away comes back. Start goes through the same service with the default reason `'owner'`; the `'broadcast'` reason mentioned in the service docblock is never passed by any caller.

### `POST /stop` after a broadcast

Both studios call `stop({ releaseStation: autoDjLocked })` when the user presses End (`client/components/studio/EndBroadcast.tsx`, `mobile/src/components/studio/OnAir.tsx`). If the account has no AutoDJ (`useAutoDjLocked`), the context retries `POST /stop` on 409 (delays 0, 400, 800, 1500, 2500 ms in `releaseStation`) to wait out harbor's disconnect callback, and any other status gives up (the sweep is the backstop). So for a Free account, ending the show switches the station off immediately; for a Pro account it hands back to AutoDJ and stays on.

On mobile the show lives at module scope in `mobile/src/broadcast/BroadcastContext.tsx`, so it survives the app being swiped away, and three more things end it. The foreground notification's "End show" button (`onNotificationStop`) calls the same `stop({ releaseStation: autoDjLocked })`, with `autoDjLocked` mirrored into a module variable so it works with no screen mounted (after a swipe-away it keeps the last known plan). Signing out under a show (`mobile/src/app/account.tsx`, and the `signedOut` effect in the context when the API rejects the token) and cancelling the go-live countdown (`mobile/src/app/live/[slug].tsx` `cancel`) call `stop()` with **no** release: the station stays `running` and `stations:sweep` switches it off, after the 150 s studio-gone grace if a session had been opened, or the full silence window if the cancel landed before the socket connected (`ensureStationOnAir` has already sent `POST /start` by then, and `abandonStart` in `broadcastManager.ts` does not undo it).

## Status endpoint: `GET /stations/{slug}/status`

`StationStatusController::__invoke` returns `{data: {...}}`:

| Field | Source |
|---|---|
| `slug`, `desired_state`, `started_at`, `last_ready_at` | Station columns |
| `state` | `StationStatusService::state()` |
| `reachable` | container answered harbor |
| `ready` | harbor `ready` |
| `icecast_connected` | harbor `icecast` (null on old containers) |
| `source` | harbor `source` (`live`/`autodj`/`silence`) or null |
| `broadcaster` | harbor `broadcaster` (null = old container = unknown, never "nobody") |
| `live_source` | `{type, client}` of the newest open stream session, or null |
| `now_playing`, `elapsed`, `remaining` | harbor title/artist/elapsed/remaining, or null |
| `playlist_length`, `up_next` | **database**, not the container: the playlist `AutoDjProgramme::resolve()` picked right now. `up_next` is at most 5 (`UP_NEXT_LIMIT`), sequential order anchored on the current title/artist (wraps; starts from the top if unknown), or the head of the shuffle deck for shuffled playlists (empty if no deck). Jingles never appear. |

`StationStatusService::fetch()` returns null without any I/O when the station is not `running`. Otherwise it reads the cache key `station-status:{id}` (default cache store; TTL `liquidsoap.status_ttl_seconds`, default 2 s; TTL `status_down_ttl_seconds`, default 15 s, only when Docker confirmed the container is down). A miss runs `pull()`: first `docker inspect` (so a dead container does not cost the whole harbor timeout), then `GET http://<container ip>:<harbor_port>/status` with header `X-Internal-Key` and timeout `harbor_timeout` (default 1.5 s). `normalize()` maps blank strings and negative times to null and coerces `ready`, `icecast`, `broadcaster`, `rms`, `playlist_length`, `up_next`. `pullFresh()` bypasses the cache (used by the sweep and the stop job) and writes the answer back with the 2 s TTL even when the container is down. `normalize()` also carries `playlist_length` and `up_next` from harbor, but `StationStatusController` ignores both and reads them from the database; the harbor copies are unused.

## Auto-stop: `stations:sweep`

Scheduled every minute, `withoutOverlapping()->runInBackground()` (`api/routes/console.php`). It replaced the old `stations:reap-idle` and `stations:reap-silent` commands. Listener count plays no part.

**Question asked:** does a running station have any source of audio or anything attached that could produce some. For each `Station::running()` (with `user.plan`), `StationAudioPolicy::verdict($station, $status->pullFresh($station))` returns exactly one `StationAudioVerdict`; `SweepStations::apply()` acts on it. Exceptions are caught per station so one bad station cannot abort the pass (exit code FAILURE if any errored). `--dry-run` reports without writing or dispatching. If the window is 0 the command prints "disabled" and exits.

### Verdict table (`StationAudioPolicy::verdict`, in evaluation order)

| # | Condition | Verdict | Sweep action |
|---|---|---|---|
| 0 | `windowSeconds() == 0` | `InUse` | (command exits earlier) |
| 1 | status null or `ready` false | `Unreachable` | nothing; clock untouched |
| 2 | `broadcaster` or `rms` missing (old image) | `Unreported` | nothing; clock untouched |
| 3 | `broadcaster === true` or `source === 'live'` | `InUse` | clear `silent_since` |
| 4 | `rms > silence_rms_threshold` | `InUse` | clear `silent_since` |
| 5 | Silent, and `hasPlayableRotation()` | `Fault` | log warning "rotation present but producing no audio"; never stops; clock left alone |
| 6 | Silent, no rotation, `studioHasGoneForGood()` | `Stop` | dispatch `StopStation` (does not need the clock) |
| 7 | Silent, `silent_since` null | `Silent` | set `silent_since = now()` |
| 8 | Silent, `silent_since + window` is past | `Stop` | dispatch `StopStation` |
| 9 | Silent, inside the window | `Silent` | (clock already running) |

Every unknown fails to "do not stop". `broadcaster === true` counts even when the mic is muted or silent.

### Auto-stop timing constants (all `api/config/liquidsoap.php`, all env-overridable)

| Config key / env | Default | Meaning |
|---|---|---|
| `silent_stop_seconds` / `LIQUIDSOAP_SILENT_STOP_SECONDS` | **600** | Continuous silence window with nothing attached. 0 disables auto-stop entirely. Real time to stop = 600 s + up to two sweep passes (one to start the clock, one to act), roughly 10-12 min. |
| `studio_gone_stop_seconds` / `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` | **150** | Grace after a web-studio broadcast ended (see below). 0 disables the shortcut. Real time roughly 150-210 s plus queue latency. Must stay above the web studio reconnect budget (120 s). |
| `silence_rms_threshold` / `LIQUIDSOAP_SILENCE_RMS_THRESHOLD` | 0.0001 (about -80 dBFS) | Output level at or below which the station counts as silent. |
| `harbor_timeout` / `LIQUIDSOAP_HARBOR_TIMEOUT` | 1.5 s | Per-station status request timeout; also the sweep's per-station cost bound. |
| `status_ttl_seconds` / `LIQUIDSOAP_STATUS_TTL` | 2 | Status cache TTL. |
| `status_down_ttl_seconds` / `LIQUIDSOAP_STATUS_DOWN_TTL` | 15 | Cache TTL for a Docker-confirmed dead container. |
| `start_verify_delay_ms` / `LIQUIDSOAP_START_VERIFY_DELAY_MS` | 750 | Wait before checking the container survived `docker run`. |
| `unhealthy_passes_before_recreate` / `LIQUIDSOAP_UNHEALTHY_PASSES` | 2 | Reconciler passes before recreating an unhealthy container. |
| `unhealthy_recreates_per_hour` / `LIQUIDSOAP_UNHEALTHY_RECREATES_PER_HOUR` | 3 | Recreate budget per station per hour. |
| `harbor_port` / `LIQUIDSOAP_HARBOR_PORT` | 8080 | Port of the container's status endpoint. |
| `stranded_session_strikes` / `LIQUIDSOAP_STRANDED_SESSION_STRIKES` | 3 | Reconciler passes before it closes an open session the container disagrees with. |

`StationAudioPolicy::windowSeconds()` has an inline fallback of 60 (`config(..., 60)`), which only applies if the config key is absent. The shipped default is 600, and `api/.env.example` and `infra/native/env/api.env.example` set 600 and 150.

### Studio-leave grace (`studioHasGoneForGood`)

A silent station with no AutoDJ rotation whose **last** stream session (by `started_at`) meets all of: `source_type === 'browser'`, `ended_at` not null, `started_at >= station.started_at` (this run only), and `ended_at + 150 s` is past, is stopped without waiting out the 10 minute window. Deliberately narrow: encoders (`external`) always get the full window; a session that never closed (drift) falls back to the window; an AutoDJ station is never affected (its broadcaster leaving is a handover). Rationale: the web studio gives up reconnecting after `RECONNECT_BUDGET_MS = 120000` (`client/lib/broadcast.ts`), so nothing will reattach.

The mobile studio's budget is `30 * 60_000` (`mobile/src/broadcast/broadcastManager.ts`) but its session is also `browser` (it connects by websocket), so a phone show that drops for more than about 150 s on a no-AutoDJ station is stopped by the sweep, and the phone's next reconnect attempt restarts it via `ensureStationOnAir` (the mobile code comment says exactly this).

### AutoDJ audibility and "fault"

`hasPlayableRotation()` is true only if the owner's plan has `autodj_enabled` **and** the playlist that `AutoDjProgramme::resolve($station)['playlist']` names right now has at least one track. Jingles do not count. The same gate appears in `AutoDjScheduler::next()` (returns null for a non-AutoDJ plan), and in `Station::jinglesAudible()` (jingle arm requires the owner's switch and the plan, so a downgraded station does not keep meter signal from jingles). So:

- Pro station, playlist has tracks, silent output: `Fault` (alert only, never stopped, stays on air).
- Pro station, resolved playlist empty (even with a full library elsewhere): not a fault; eligible to stop.
- Downgraded station: the library is kept but silent; eligible to stop.

### `StopStation` job

Queued (default queue), 1 try, `WithoutOverlapping($stationId)->dontRelease()`. It does **not** trust the sweep: it re-pulls a fresh status, re-runs `verdict()`, and proceeds only on `Stop`. Then `lifecycle->stop($station, reason: 'silent')` (never forced, so a broadcaster who connected in the gap gets a refusal that is caught and logged at info as "Silent-station stop declined"), then clears `silent_since`. It returns silently if the station is gone or already stopped. The timeline reason `silent` is the only thing that tells an auto-stop from an owner stop.

## Drift and failure handling: `stations:reconcile`

Every minute (`console.php`). It compares `docker ps -a` to intent (`ReconcileStations`):

| Drift | Detected as | Action |
|---|---|---|
| Orphan | container slug matches no station row (even soft-deleted) | remove |
| Unwanted | station exists but stopped or soft-deleted | remove (this is what stops `--restart unless-stopped` resurrecting stopped stations after a reboot) |
| Missing | `desired_state = running`, no container | `PlaylistFileWriter::write` + `supervisor->up()` directly (not through `StationLifecycleService`, so no lock, no `station_events` row), broadcast `StationStateChanged` event `reconciled` |
| Unhealthy | status in `restarting`/`exited`/`dead`/`paused` or health `unhealthy` (health `starting` is not unhealthy) | after 2 consecutive passes (counter reset when a pass finds it healthy), remove + recreate; the recreate counter expires 1 hour after the latest recreate, and at 3 the reconciler logs an error, leaves it, and the command exits FAILURE; `reconciled` event |
| Stranded session | open session on a running station while container `broadcaster` (fallback `source === 'live'`) is false | after 3 consecutive passes, close the session (`ended_at = now`). Uses the cached `fetch()`; skipped if the container does not answer. Sends no realtime event and does not delete `metadata:{id}` |

Counters live in cache keys `station-unhealthy-passes:` (6 h), `station-recreates:` (1 h), `station-live-strikes:` (1 h). `--dry-run` supported. The command also exits FAILURE when any action throws.

A separate manual command, `stations:relaunch [--slug=] [--include-trashed]`, is not scheduled: it rewrites the m3u and calls `supervisor->up()` for every `running` station, which **restarts** containers that are already healthy (listeners drop).

### What clients see in each failure

| Situation | `state` | Notes |
|---|---|---|
| Owner never started it | `offline` | `desired_state = stopped` |
| Started, container booting | `starting` | polls every 2 s |
| Container crashed/removed while `running` | `offline` (desired still `running`) | reconciler recreates within about a minute; dashboard shows "Off air" then "Starting" |
| Crash loop past recreate budget | `offline` | reconciler leaves it and logs an error; nobody is told in-app |
| Icecast rejected the source | `degraded` | dashboard headline "Not reaching listeners" |
| Harbor unreachable, Docker says up | `starting` | forever if it never answers; not distinguished from a wedged container |
| Docker daemon unreachable | whatever harbor says | `probeContainer` fails open |
| Silent Pro station with a rotation | `on_air` / `source: silence` | headline "No sound"; `Fault` log only |
| Live encoder, owner presses off | refused | 409 `station_is_live_external`; dialog offers cut-off (sends `force: true`) |
| Live browser, owner presses off | refused | 409 `station_is_live` |
| Lost `live_disconnected` | open session persists | stop stays refused until reconcile strikes clear it |

## Events and realtime

`StationStateChanged` (`api/app/Events/`) is a signal, not a payload. Broadcast on private channel `user.{userId}` as `.station.state` with `{slug, event, at}`; queue `realtime` (the production worker must run `--queue=realtime,default` or nothing is delivered); `ShouldDispatchAfterCommit`. `at` is stamped at dispatch. Producers:

| Producer | `event` values |
|---|---|
| `StationLifecycleService` | `started`, `stopped` |
| `ReconcileStations` | `reconciled` |
| `StationEventController` (container callbacks) | `shutdown`, `icecast_connected`, `icecast_disconnected`, `icecast_error`, `live_connected`, `live_disconnected` (not `boot`, which is accepted and recorded but not broadcast) |

The container callback `POST /internal/station-event` (`StationEventController`, `X-Internal-Key`) also: sets `last_ready_at = now()` on `icecast_connected`; opens a `StreamSession` on `live_connected` (with `source_type` from `via`, default `browser`; reuses an already-open row; dispatches `SendStationLiveNotifications` delayed 2 min); closes all open sessions and deletes `metadata:{id}` on `live_disconnected`. It also caches the last event at `station-event:{id}` for 3600 s and records a `StationEvent` row (source `container`, with `via`/`client` properties). Validation: `slug` max 64, `event` max 32, `client` max 255, `via` must be `browser` or `external`; an unknown event is 422, an unknown or soft-deleted slug 404. It does not check whether the station is `running`.

### Studio drop reports (`studio_drop`)

The container's `live_disconnected` never says why a broadcaster left. The web studio fills that in: when its socket closes mid-show, `client/lib/studioDropLog.ts` snapshots the page (visible or hidden, how long hidden, Chrome `freeze`/`resume`, `navigator.onLine`, Network Information type and speed, socket `bufferedAmount` now and at peak, wake lock held, close code) and stores it in localStorage at once. When the reconnect loop ends it adds the outcome (`reconnected`, `gave_up`, `stopped`), time down and attempts, then `POST /stations/{slug}/studio-drops` (`StudioDropController`, owner only, throttle 30/min, max 20 per request, whitelisted fields). Unsent reports go out on the next broadcast or by keepalive fetch on `pagehide` (as `page_closed` if still unresolved); the API drops repeats by report `id` for 2 days. Rows are `studio_drop`, source `owner`, shown on the admin station page. Admin monitoring only. The mobile studio does not report yet.

## Data touched

| Field | Where | Written by |
|---|---|---|
| `stations.desired_state` | intent | `StationLifecycleService` only |
| `stations.started_at` | run start; used by studio-gone check | lifecycle start/stop |
| `stations.silent_since` | silence clock (a column so a Redis flush cannot reset every clock) | `SweepStations` (set/clear), `StopStation` (clear) |
| `stations.last_ready_at` | last `icecast_connected` | `StationEventController`; shown in status |
| `stream_sessions.*` | live broadcast rows | container callbacks; lifecycle stop and reconcile close them |
| Redis `metadata:{id}` | now-playing | container push; deleted on stop and `live_disconnected` |
| Cache `station-status:{id}` | status cache | `StationStatusService` |
| Cache `station-lifecycle:{id}` | lifecycle lock | `StationLifecycleService` |

`StationObserver::updated()` restarts (`supervisor->up()`) a **running** station when one of `name, slug, description, genre, icecast_mount, icecast_password, artwork_url` changes (jingle columns are instead pushed live over telnet, only when running); a stopped station is left alone and picks changes up at next start, except that a **slug** change always tears down the old-slug container and renames the playlists directory, running or not. `deleting` (soft delete) removes the container without touching `desired_state`; `restored` brings it back only if `desired_state` was `running`. `UserObserver::updated()` pushes watermark and jingle settings to a user's running stations over telnet when `plan_id` changes; it does not stop or start anything. Station `desired_state` changes are also written to the activity log (`Station::getActivitylogOptions`).

## Surfaces

**Web dashboard.** `client/components/dashboard/StationPower.tsx` is the power card. It polls `useStationStatus(slug)` (`client/hooks/useStationStatus.ts`): 2 s before the first answer, while `starting` or during a live handover (`source`/`broadcaster` disagree), 30 s while `offline`, otherwise just after the track is due to end (floor 3 s, ceiling 10 s, or 30 s when the websocket is connected), exponential backoff up to 30 s on failure, paused while the tab is hidden. A caller-supplied `intervalMs` (the encoder go-live panel passes 2 s) replaces the self-pacing only while the websocket is down. `StationStateChanged` signals (from `RealtimeContext`, `.station.state` on `user.{id}`) are coalesced for 120 ms into an immediate refetch; a signal older than the last seen is ignored. Headlines (`HEADLINE_LABEL`): Live, On air, No sound (source silence), Off air, Starting…, Checking…, Status unknown (no answer, or 10 s with none), Not reaching listeners (degraded). Headline precedence: `degraded` then `starting` (fault/starting), then broadcaster attached (live), then off, then no answer/checking, then silent vs on air. The buttons depend on state: off air shows "Start AutoDJ" (locked accounts see a "Go live" trigger instead); running shows "Go live" (`GoLiveTrigger`) and "Turn station off"; live from this browser shows "Open studio"; live from an encoder or another browser shows "Hear your stream" (Turn off is hidden only for a browser broadcast elsewhere, so an encoder broadcast can still be cut off). "Turn station off" (asks for confirmation when AutoDJ is playing; a `station_is_live_external` refusal opens "Cut off this broadcast?" which re-posts with `force: true`). The source line reads "Live from this browser / another browser / <encoder client> / an encoder", "Handing back to AutoDJ", "AutoDJ", "Silence".

**Mobile.** `mobile/src/lib/station.ts` `useStationStatus` mirrors the web cadence (2 s / 30 s / track-aware 3-10 s), refetches when the app becomes active, and has **no** websocket push. `mobile/src/components/station/usePower.ts` (`usePower`, used by `mobile/src/app/station/[slug]/index.tsx`) calls start/stop and shows the same force confirmation for `station_is_live_external` (the overview re-posts with `force: true`); the Turn off control is hidden while live from this phone or from another browser (`canTurnOff` in `index.tsx`), and an AutoDJ station with nobody attached gets a "Turn <name> off?" confirmation first. The studio's End uses the same 5-step `releaseStation` retry as web (`mobile/src/broadcast/BroadcastContext.tsx`).

**Player page / public API.** Read `is_on_air`, `is_live` and `state` from `StationResource` (cheap state only). See [Public player and embed](public-player-and-embed.md).

**Admin.** Start and stop appear as `started`/`stopped` rows on the station event timeline. There is no admin start/stop route: `api/routes/admin.php` has only index, show, feature and upgrade for stations (see [Admin panel](admin-panel.md)).

## Gaps and traps

1. **Stale silence clock survives an owner stop.** `stop()` and `start()` never touch `silent_since`; only the sweep (on `InUse`) and `StopStation` clear it. If a station is stopped by the owner while the clock is running (silent, nothing attached), then restarted later, the old timestamp is still there. A freshly started station with no source (rms 0, no broadcaster) can reach verdict 8 (`Stop`) on the very first sweep after boot, instead of getting a fresh window. `StopStation` re-checks with the same stale clock, so it only rescues a station where the DJ connected in the gap. Found by reading (no test covers it: `StationLifecycleServiceTest.php` and `StationPowerControllerTest.php` never mention `silent_since`).
2. `StationAudioPolicy::windowSeconds()` falls back to 60 if the config key is absent, while the config default is 600. Only the config value is real; the 60 is never reached with the shipped config.
3. `Station.php`'s class docblock still lists `@property bool $is_live`, which no longer exists as a column (dropped 2026-08-16). Derived only.
4. `StationLifecycleException` lives in `api/app/Services/`, not `app/Exceptions/`.
5. `stop($force = true)` has no caller. The docblock says "admin tooling and the idle reaper"; the reaper is gone and there is no admin tool. Dead until something uses it.
6. The service docblock says start's `$reason` is `'broadcast'` for the studio's implicit start; nothing passes it, so studio starts are indistinguishable from power-button starts on the timeline (both record `owner`).
7. `BroadcastStateService` is effectively dead. Its only user is `StreamSessionController::store()`/`destroy()`. `POST /stations/{station}/sessions` is a live, tested route (`EncoderSessionAttributionTest.php`), but no web or mobile code calls it (only `GET .../sessions` is used); real broadcasts are opened by the container callback. The route lets an authenticated owner insert an open session (`browser`/`electron`) that closes any other open session, 409s on a live encoder unless the station is stopped, and makes `isLive()` true, which the stop guard then honours. The `broadcast:station:{id}` cache is only written by `store()`. `isLive()`/`isLiveFromState()` have no callers outside this class.
8. `StreamSessionController::destroy` exists (`DELETE /stations/{station}/sessions/{session}`) and closes the given session (also forgets the `broadcast:station` cache and deletes `metadata:{id}`) without stopping the broadcast; it does not check `source_type`. `apiResource` here has no `scopeBindings()`, so the session is resolved by id alone and is not checked to belong to `{station}`: an owner can close any session, on any station, whose UUID they know.
9. A comment in `StationLifecycleService::stop()` says `StationEventController::closeSessions` reacts to a `shutdown` event. It does not: only `live_disconnected` closes sessions. A crashed container leaves the session open until the reconciler's strikes (3 passes) or a stop.
10. `LiquidsoapSupervisor::verifyStarted()` docblock says the reconciler retries "within five minutes"; the schedule is every minute.
11. A `LockTimeoutException` from the 8 s lifecycle lock is not mapped anywhere (grep of `api/app` and `bootstrap/` finds none); a contended start/stop surfaces as Laravel's generic 500. The power card then toasts the response `message` ("Server Error" with debug off) or its own fallback.
12. Mobile broadcasts are `browser` sessions, so the 150 s studio-gone shortcut applies to phones even though the mobile reconnect budget is 30 minutes. For a no-AutoDJ account a longer outage stops the station and restarts it on the next reconnect attempt, dropping listeners.
13. `state` on list/show resources is only offline/on_air/live. A station that is `running` but has no container, or is `degraded`, reads `on_air` on the public resource until `/status` is asked (`is_on_air` is intent, not audibility).
14. `starting` is unbounded: a container Docker calls `running` whose harbor never answers is `starting` forever. Only the reconciler's unhealthy path (Docker health `unhealthy`) eventually recreates it.
15. A Free (no AutoDJ) station that nobody attaches to is stopped by the sweep about 10-12 minutes after start; a DJ who powers on and opens BUTT later than that finds it off. The encoder ingest docs must not promise otherwise.
16. `stations:sweep` loads `user.plan` but not the default playlist or slots, so each silent station costs extra queries in `AutoDjProgramme::resolve`. Minor.
17. `Fault` is log-only: no in-app notification, no admin alert, only `Log::warning`. The dashboard shows "No sound".
18. `stations:reconcile` starts missing containers with `supervisor->up()` outside the lifecycle lock, so it can race a simultaneous owner start; `up()` restarts a container that is already running.
19. The stop's live guard treats any open session as live, including a ghost. Reconcile clears ghosts only after 3 passes, and only for running stations.

## Tests

`api/tests/Feature/`: `StationLifecycleServiceTest.php`, `StationPowerControllerTest.php`, `StationStatusTest.php`, `DerivedStationStateTest.php`, `StationSweepTest.php` (verdict table, clock, dry run, job re-check, studio-gone rows), `ReconcileStationsTest.php`, `StationEventControllerTest.php`, `StationEventBroadcastTest.php`, `StationStopClearsNowPlayingTest.php`, `StationObserverTest.php`. The supervisor short-circuits in test mode (`LiquidsoapSupervisor::inTestMode()`), so no test starts a real container.

## History

Plans and handoffs (history, not spec): `docs/` audio-based auto-stop notes, `station-hardening-plan.md`, the station lifecycle artifact; superseded commands `stations:reap-idle` and `stations:reap-silent`.
