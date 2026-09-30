---
feature: Observability and events (station timeline, audit logs, Sentry, metrics, alerts)
verified: 2026-09-29 against 360c382 plus uncommitted work
sources:
  - api/app/Models/StationEvent.php
  - api/config/station_events.php
  - api/database/migrations/2026_09_09_110000_create_station_events_table.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Console/Commands/PruneStationEvents.php
  - api/routes/console.php
  - api/routes/api.php
  - api/routes/admin.php
  - api/app/Http/Controllers/Admin/StationController.php
  - api/resources/views/admin/station.blade.php
  - api/app/Http/Controllers/StreamKeyController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Jobs/StopStation.php
  - api/app/Services/TrackImporter.php
  - api/app/Services/AutoDjScheduler.php
  - api/app/Models/Station.php
  - api/app/Models/User.php
  - api/app/Models/Admin.php
  - api/app/Models/Plan.php
  - api/app/Models/Invite.php
  - api/app/Models/AuthenticationLog.php
  - api/app/Models/Concerns/AuthenticationLoggable.php
  - api/app/Listeners/LogAuthenticationEvents.php
  - api/app/Listeners/RecordUserLastLogin.php
  - api/app/Http/Controllers/AuthController.php
  - api/app/Http/Controllers/Admin/RawEmailController.php
  - api/config/activitylog.php
  - api/config/sentry.php
  - api/config/logging.php
  - api/config/services.php
  - api/bootstrap/app.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Http/Controllers/MetricsController.php
  - api/app/Services/IngestMetrics.php
  - api/app/Http/Middleware/VerifyInternalKey.php
  - api/app/Services/AdminTelegram.php
  - api/app/Jobs/SendAdminTelegramAlert.php
  - api/.env.example
  - infra/alloy/config.alloy
  - infra/native/nginx/gocast-api.conf
  - infra/native/deploy-native.sh
  - client/instrumentation-client.ts
  - client/instrumentation.ts
  - client/sentry.server.config.ts
  - client/sentry.edge.config.ts
  - client/next.config.ts
  - client/app/layout.tsx
  - client/app/global-error.tsx
  - client/app/error.tsx
  - client/app/dashboard/error.tsx
  - client/app/robots.ts
  - api/app/Http/Requests/Admin/LoginRequest.php
  - api/app/Listeners/RecordAdminLastLogin.php
  - api/app/Http/Controllers/GoogleAuthController.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Webhooks/Resend/EmailReceived.php
  - api/resources/views/liquidsoap/station.blade.php
fingerprint: d3de59c91f088d7c
---

# Observability and events

Six separate mechanisms answer "what happened?", and they do not overlap:

| Mechanism | Answers | Store | Retention |
|---|---|---|---|
| `station_events` | What did this station do, in order? | MySQL table | 30 days, pruned nightly |
| `activity_log` (spatie) | Who changed a record (admin actions, model edits)? | MySQL table | Nothing deletes it (see traps) |
| `authentication_log` | Who signed in through a Laravel guard? | MySQL table | Nothing deletes it |
| Sentry | What threw? | Sentry cloud | Sentry's |
| `/api/internal/metrics` | Counts and gauges for the fleet | Computed per scrape | None (nothing scrapes it in the repo) |
| Telegram alerts | Something the operator should know about now | Telegram chat | Telegram's |

The one thing people get wrong: **`station_events` is a human-readable timeline for the admin panel and nothing else.** No product logic reads it. Not the status pill, not auto-stop, not billing, not AutoDJ. Every write goes through `StationEvent::record()`, which swallows its own failures, so a row can be missing at any time. Do not branch on it. The live/AutoDJ/on-air state comes from open `stream_sessions`, `desired_state`, the container and `StationStatusService`, described in [station-lifecycle.md](station-lifecycle.md).

## Station events (`station_events`)

### Table

`api/database/migrations/2026_09_09_110000_create_station_events_table.php`.

| Column | Notes |
|---|---|
| `id` | Auto-increment bigint (not a UUID, unlike most tables). |
| `station_id` | UUID FK to `stations`, `cascadeOnDelete`. Soft-deleting a station keeps its events (the admin timeline route uses `withTrashed()`); `stations:prune-deleted` force-deleting it takes them along. |
| `type` | string(32). |
| `source` | string(16): `container`, `owner`, `admin`, `system`. |
| `causer_type`, `causer_id` | Nullable strings, no FK. `causer_type` holds the morph alias (`user`, `admin`; see `Relation::enforceMorphMap` in `AppServiceProvider`). |
| `properties` | Nullable JSON, cast to array. `record()` stores `null` instead of `[]`. |
| `created_at` | Only timestamp (`UPDATED_AT = null`). Rows are never revised. |

Indexes: `(station_id, created_at)` for the timeline, `created_at` for the prune.

### Types and who writes them

`StationEvent::TYPES` is the full list (also the admin filter order). 13 types:

| Type | Source | Written by | `properties` |
|---|---|---|---|
| `boot`, `shutdown`, `icecast_connected`, `icecast_disconnected`, `icecast_error`, `live_connected`, `live_disconnected` | `container` | `StationEventController` (`POST /api/internal/station-event`) | `via` (`browser` or `external`) and `client` (broadcaster user-agent), only on `live_connected` from a relaunched container. Nulls are dropped. No error text is stored for `icecast_error`, despite what the migration comment says. |
| `started` | `owner` (or `system`/`admin` if the causer resolves so) | `StationLifecycleService::start()` | `reason` |
| `stopped` | `owner`, or `system` for the sweep | `StationLifecycleService::stop()` | `reason` (`owner`, `owner_cutoff` or `silent`), `forced` |
| `track_uploaded` | resolved from the request | `TrackImporter` (after commit) | `track_id`, `kind`, `title`, `artist`, `bytes` |
| `track_deleted` | resolved from the request | `TrackImporter::destroy()` and the bulk delete (one event per file) | same five fields, copied so the row still reads after the track is gone |
| `playlist_changed` | `system` (explicit) | `AutoDjScheduler`, at the track boundary where the rotation switched playlist | `from_playlist_id`, `to_playlist_id`, `playlist`, `slot_id`, `slot` |
| `stream_key_rotated` | `owner` (explicit) | `StreamKeyController::rotate()` | none. The key is deliberately never recorded. |

`StationEvent::record($station, $type, $source = null, $properties = [], $causer = null)`:

- Causer defaults to whoever is authenticated, checking guards `admin`, `sanctum`, `web` in that order (skipping any guard not present in `config('auth.guards')`). No authenticated model means `null`.
- Source defaults from the causer: `Admin` gives `admin`, `User` gives `owner`, none gives `system`.
- Any exception is caught and written to `Log::warning('Could not record station event')`; `record()` returns `null`.
- There is no `autodj_started` type. AutoDJ is Liquidsoap's fallback, so `live_disconnected` is the switch to AutoDJ and `live_connected` the switch away. AutoDJ airtime is derivable by pairing them but nothing computes it.

Reasons actually passed today: `start()` always gets the default `'owner'` (its only caller is `StationPowerController::start`). `stop()` gets `'owner'` from `StationPowerController::stop` and `'silent'` from `StopStation` (the sweep, `api/app/Jobs/StopStation.php:94`). Inside `stop()`, when the station is live and `cutExternal` is true and the open session is external, the reason is overwritten to `'owner_cutoff'` (`StationLifecycleService.php` ~183). `forced` is the `$force` argument, which no caller sets, so it is always `false`. `stop()` also closes any open `stream_sessions` before tearing the container down, but writes no `live_disconnected` event for them.

### Container ingest, rate cap and cache

`POST /api/internal/station-event` (`routes/api.php`, group `['internal','throttle:internal']`; `throttle:internal` is 300 requests/minute per IP, defined in `AppServiceProvider`; auth is the `X-Internal-Key` header via `VerifyInternalKey`, wrong key is 401 `{message:"Unauthorized."}`; a blank `INTERNAL_API_KEY` throws a `RuntimeException`). The station containers reach it through the internal nginx vhost, but the public API vhost's `location /` also serves `/api/internal/*`, so the key is the only gate there (`infra/native/nginx/gocast-api.conf`).

Validation: `slug` required string max 64; `event` required string max 32; `client` optional nullable string max 255 (trimmed, empty becomes null); `via` optional nullable, `browser` or `external`. An event outside the seven container types is 422 `{ok:false,error:"unknown event"}`. `live_silent` and `live_audio` from old containers get this 422 and are ignored by the container. Unknown slug is 404. Soft-deleted stations are not found either (default scope).

Side effects of the same request (these are the real product logic living next to the log; the log itself is just a `record()` call):

- `Cache::put('station-event:{id}', {event, at}, 3600)`. Nothing in the API reads this key (`CACHE_PREFIX` is only referenced inside the controller). Dead write.
- `icecast_connected` sets `stations.last_ready_at = now()`.
- `live_connected` opens a `StreamSession` unless one is already open (`source_type` = `via`, default `browser`), and queues `SendStationLiveNotifications` with a 2 minute delay.
- `live_disconnected` closes all open sessions and deletes Redis key `metadata:{id}`.
- `StationStateChanged` is broadcast (queued, not `ShouldBroadcastNow`) for `shutdown`, `icecast_*` and `live_*`, never for `boot`. See [realtime-events.md](realtime-events.md).
- `Log::info('Station reported a lifecycle event')`.

Rate cap: only for `source = container`. `config('station_events.max_per_minute')` (env `STATION_EVENT_MAX_PER_MINUTE`, default 60, `0` disables) counts per station per minute in a cache key `station-event-rate:{id}:{YmdHi}` (`Cache::add` seed with TTL 120 s, then `increment`). Over the cap the row is silently dropped (`record()` returns null) but the endpoint's side effects above still run. Owner, admin and system events are never capped.

### Retention

`stations:prune-events` (`PruneStationEvents`), scheduled `dailyAt('04:50')`, `withoutOverlapping()`, `runInBackground()` in `routes/console.php`. Deletes rows with `created_at` older than `station_events.retention_days` (env `STATION_EVENT_RETENTION_DAYS`, default 30) in chunks: `--chunk=1000` default, floor of 100 per statement, looping until a pass deletes nothing. `retention_days <= 0` prints a notice and exits successfully without deleting. No rollup precedes the delete. Sibling nightly prunes: `listeners:prune` 04:20, `stations:prune-deleted` 04:40, `notifications:prune` 05:00.

### Admin timeline

`GET /admin/stations/{station}` (`admin.stations.show`, `auth:admin`, `withTrashed()`) in `Admin\StationController::show`, view `resources/views/admin/station.blade.php`. See [admin-panel.md](admin-panel.md) for the panel around it.

- Header stats: owner email and plan, `desired_state` ("owner intent, not containers"), Live (open broadcast session via `isLive()`), track count, "Last ready" (`last_ready_at`).
- "Last 24 hours" chips: a `type => count` query over the last day (`reorder()` to stay valid under `only_full_group_by`); each chip links to that type's filter.
- Filters: `type` (any of `StationEvent::TYPES`) and `source` (any of `SOURCES`), both plain query-string values that are not validated (an unknown value just matches nothing).
- 50 per page, newest first. Consecutive identical rows (same type, source and `properties`) are folded into one row with a count and a "back to" time. Folding happens within a page only, so a run crossing a page boundary appears twice.
- Each row: relative and absolute time, glossed label plus raw type, source badge and causer label (`causerLabel()` does a `find()` per row and shows email, else name, else `type#id`; a deleted account shows `type#id`), and `properties` rendered key/value.
- Empty states: "Nothing recorded for this station yet." and "No events match that filter."
- Only admins see this. Owners have no timeline in the dashboard or the mobile app.

## Activity log (spatie)

`api/config/activitylog.php`: enabled by `ACTIVITYLOG_ENABLED` (default true), `clean_after_days` 365, buffer off, default log name `default`. Table from `2026_04_18_144640_create_activity_log_table.php`. Morph aliases `user`, `admin`, `station`, `plan`, `invite` are enforced.

Automatic model logging (`LogsActivity`, `logOnlyDirty()`, `dontLogEmptyChanges()`):

| Model | Attributes logged |
|---|---|
| `Station` | name, slug, description, genre, featured, desired_state |
| `User` | name, email, email_verified_at, plan_id, plan_expires_at, invite_id |
| `Admin` | name, email |
| `Plan` | name, slug, max_stations, max_running_stations, max_listeners, autodj_enabled, analytics_days, embed_enabled, encoder_enabled, watermark_enabled |
| `Invite` | code, plan_id, duration_days, label, email, recipient_name, max_uses, uses, expires_at, sent_at |

Automatic causer resolution uses the default auth guard, which is never the admin guard. So admin-driven edits are also logged explicitly with `activity()->causedBy($request->user('admin'))`:

| Description | Where |
|---|---|
| `featured station` / `unfeatured station` | `Admin\StationController::feature` |
| `upgraded account` (props: plan, expires_at, station) | `Admin\StationController` (upgrade send) |
| minted / sent / revoked invite | `Admin\InviteController` |
| `sent announcement` | `Admin\AnnouncementController` |
| `sent email` | `Admin\RawEmailController`; the same controller reads the last 15 back as its "sent emails" history, so the activity log is the only record of one-off emails |
| `provisioned account` | `Admin\AccountController` |

There is no admin page for browsing the activity log itself; access is SQL or tinker.

## Authentication log

`authentication_log` table (`2026_04_18_145439`), model `AuthenticationLog`, trait `AuthenticationLoggable` (gives `User` and `Admin` an `authentications()` morph-many). Written by `App\Listeners\LogAuthenticationEvents`, auto-discovered (`handleLogin`, `handleFailed`, `handleLogout`, confirmed with `php artisan event:list`):

- `Login`: row with IP, user agent (column is `string(500)`; the listener does not truncate), `login_at`, `login_successful = true`.
- `Failed`: only when the event carries a real user (a wrong password for an existing account); unknown emails write nothing. `login_successful = false`.
- `Logout`: stamps `logout_at` on the latest open row for that account, else inserts a logout-only row.

Fires only when Laravel's `Login`/`Failed`/`Logout` events fire. Only two code paths call an auth guard: the admin panel (`Admin\LoginRequest`, `Auth::guard('admin')->attempt`, plus its guard `logout()`) and `AuthController::login` (`Auth::attempt`, default `web` guard). Nothing else in `app/` calls `Auth::login`/`attempt`, so Google sign-in (`GoogleAuthController`), registration and Sanctum-token requests write no row. `AuthController::logout` only deletes the access token and fires no `Logout`, so a user's `logout_at` is never stamped in production; only admin-panel logouts stamp it. `location` and `cleared_by_user` columns exist and are never written. `RecordUserLastLogin` (`web` guard) and `RecordAdminLastLogin` (`admin` guard) are separate `Login` listeners that set `last_login_at` on the user or admin. Nothing displays or prunes this table.

## Sentry

### API (Laravel, `sentry/sentry-laravel`)

`api/config/sentry.php`, wired in `bootstrap/app.php` with `Integration::handles($exceptions)`.

| Setting | Value |
|---|---|
| DSN | `SENTRY_LARAVEL_DSN`, falling back to `SENTRY_DSN`. Empty disables the SDK. |
| `sample_rate` (errors) | 1.0 unless `SENTRY_SAMPLE_RATE` |
| `traces_sample_rate` | null (off) unless `SENTRY_TRACES_SAMPLE_RATE`. `.env.example` sets 0 and warns that 1.0 costs ~0.7 s per request on a dev laptop. |
| `profiles_sample_rate` | null unless set |
| `send_default_pii` | false (`SENTRY_SEND_DEFAULT_PII`). This matters: harbor-auth request bodies carry the stream key in `password`; `HarborAuthController` relies on PII being off. |
| `ignore_transactions` | `/up` |
| `enable_logs` | false (`SENTRY_ENABLE_LOGS`) |
| `release`, `environment` | `SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`; unset by default and not set in `.env.example` |
| Breadcrumbs and tracing toggles | all default on except sql/redis bindings and Redis commands; `missing_routes` tracing off |

Exception filtering (`bootstrap/app.php`): `StationLifecycleException` and `InviteException` are `reportable` only when `status >= 500`. Plan-limit refusals and used-invite errors never reach Sentry. Both are also rendered as JSON with a stable `code`.

Prod wiring: `deploy-native.sh` passes only the client's build-time variables (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`). The API DSN is read from the API's own `.env`; the script does not set it.

### Web (Next.js, `@sentry/nextjs`)

- `client/instrumentation.ts` loads `sentry.server.config.ts` (Node runtime) or `sentry.edge.config.ts` (edge) and exports `onRequestError = Sentry.captureRequestError`.
- All three inits are gated: `NODE_ENV === "production"` AND `NEXT_PUBLIC_SENTRY_DSN` set. Dev is never reported.
- Server and edge: `tracesSampleRate: 0.2`, `enableLogs: true`, `sendDefaultPii: false`.
- Browser (`instrumentation-client.ts`): `tracesSampleRate: 0.2`, `enableLogs: true`, `sendDefaultPii: false`, `replayIntegration()` with `replaysSessionSampleRate: 0.02`, `replaysOnErrorSampleRate: 0.5` (default replay masking; the privacy page says all text and inputs are masked and media blocked). Replay applies to every page including player pages. Also exports `onRouterTransitionStart`.
- Ignore filters (browser only): `denyUrls: [/^app:\/\//]`; `ignoreErrors`: `/Java object is gone/` (Facebook/Instagram Android in-app browser), `/Object Not Found Matching Id:\d+/` (Microsoft Outlook / Defender Safe Links scanner, a bot opening emailed links in headless CefSharp), `/xbrowser is not defined/` (XBrowser-style Android browsers). None of these are filtered on the server or edge.
- `next.config.ts` wraps with `withSentryConfig`: org `gocast`, project `javascript-nextjs`, `widenClientFileUpload`, `tunnelRoute: "/monitoring"` (browser events go through a same-origin rewrite; `robots.ts` disallows `/monitoring`), tree-shaking debug logging, `automaticVercelMonitors: true` (Vercel-only, meaningless on this host). Source-map upload needs `SENTRY_AUTH_TOKEN` at build.
- Error boundaries: only `app/global-error.tsx` calls `Sentry.captureException`. `app/error.tsx` and `app/dashboard/error.tsx` do not; `dashboard/error.tsx` only `console.error`s. Server-side render errors reach Sentry through `onRequestError`; client-side render errors caught by `app/error.tsx` or `dashboard/error.tsx` are not passed to Sentry by any code in the repo. Whether the SDK also hooks React boundaries on its own cannot be determined from the repo.

### Google Translate DOM patch

`client/instrumentation-client.ts`, top of file, runs before the Sentry gate and is not dev-gated. Once per page (guard flag `Node.prototype.__translateSafe`), it wraps `Node.prototype.removeChild` (if `child.parentNode !== this`, returns the child and does nothing) and `Node.prototype.insertBefore` (if the reference node's parent is not `this`, appends instead of throwing). Both `console.warn("[translate-safe] ...")`. Cost: translated text can go stale. Fixes the React `NotFoundError` crash when Chrome page translation has replaced text nodes (facebook/react#11538). Product code cooperates by keying spans around conditional text (see the comment in `dashboard/error.tsx`).

### Mobile

The Expo app has no Sentry: no dependency in `mobile/package.json` or `app.json`, and no import anywhere under `mobile/`. Mobile crashes are not reported anywhere.

## Third-party page analytics (root layout)

`client/app/layout.tsx` injects, only when `NODE_ENV === "production"`, into `<head>` on every route (marketing, dashboard, player, auth, studio):

- Umami (`cloud.umami.is/script.js`), Google Analytics (gtag id in the file), and Microsoft Clarity (`ms-clarity` inline script, project id `yohlpgd7l4`), all `afterInteractive`.
- Clarity has no route exclusions, no consent banner, and no masking options in code; any masking (the privacy page says sensitive content is masked) is configured in Clarity's dashboard, which cannot be verified from the repo. The comments in `PasswordInput.tsx` and `PlayerView.tsx` refer to changes made after watching Clarity recordings.
- The privacy page (`client/app/(marketing)/privacy/page.tsx`) lists Sentry, GA, Umami and Clarity. Not among this doc's `sources` (it is copy); update it if any of these change.

## Metrics (Prometheus text)

`GET /api/internal/metrics`, `MetricsController` (`routes/api.php`, inside the `internal` group but `withoutMiddleware('throttle:internal')`; `X-Internal-Key` required, otherwise 401). Content type `text/plain; version=0.0.4`. Hand-rolled text, no SDK; every series is one query, one Redis call or one `docker ps` (`LiquidsoapSupervisor::listContainerStates()`).

| Series | Type | Meaning |
|---|---|---|
| `gocast_stations_total` / `_live` / `_trashed` / `_stopped` | gauge | Stations (non-deleted); with an open broadcast session; soft-deleted; `desired_state = stopped` |
| `gocast_supervisor_containers_expected` | gauge | Stations with `desired_state` running |
| `gocast_supervisor_containers_running` / `_total` / `_unhealthy` | gauge | Docker view. **-1 when the daemon/socket proxy is unreachable.** `unhealthy` counts any non-running container or one failing its healthcheck. |
| `gocast_stream_sessions_started_last_24h` / `_open` | gauge | Stream sessions |
| `gocast_tracks_total` / `gocast_tracks_bytes` | gauge | All tracks, `sum(file_size_bytes)` |
| `gocast_users_total` | gauge | Users |
| `gocast_queue_jobs_pending` / `_failed` | gauge | `jobs` / `failed_jobs` table counts; -1 if the table is unreadable (for example a non-database queue driver) |
| `gocast_harbor_auth_total{outcome,method}` | counter | From `IngestMetrics` (Redis `INCR` on `metrics:harbor-auth:{outcome}:{method}`). allowed: `token`, `key`; refused: `plan`, `unknown`, `none`. All combinations are emitted with 0 so `rate()` alerts work. Counters reset if Redis is flushed. `IngestMetrics` never throws: a failed increment is dropped and a failed read reports 0. |
| `gocast_redis_up` | gauge | 1 if `Redis::ping()` succeeds |

Nothing in the repo scrapes this endpoint (`infra/alloy/config.alloy` does not; only host metrics are scraped). Also, the Liquidsoap containers' own Prometheus output is out of scope here; see [liquidsoap-station-script.md](liquidsoap-station-script.md).

## Grafana Alloy (`infra/alloy/config.alloy`)

Alloy runs as a host service (apt), reading credentials from `/etc/default/alloy` (`GRAFANA_CLOUD_LOKI_URL/_USERNAME/_API_KEY`, `GRAFANA_CLOUD_PROM_URL/_USERNAME/_API_KEY`). It ships:

- Logs from Docker containers labelled `gocast.station` (relabelled with `container`, `station` slug, `service=liquidsoap`; discovery refresh 5 s, direct read-only docker socket).
- Logs from files: `/srv/gocast/app/api/storage/logs/*.log` (laravel), `/var/log/nginx/gocast-*.log`, `/var/log/php8.4-fpm.log`, `/var/log/icecast2/*.log`.
- Journal units `gocast-queue`, `gocast-scheduler`, `gocast-client`.
- Host metrics through `prometheus.exporter.unix`, job `node`, remote-written with an external label `host`.
- The Icecast `/status-json.xsl` scrape is commented out.

The file path is `infra/alloy/config.alloy` (not `infra/infra/alloy`). Deployment details are in [deployment-infra.md](deployment-infra.md).

## Logging

`api/config/logging.php` is the stock Laravel file. Default channel `stack`; `LOG_STACK` default `single` (`storage/logs/laravel.log`); `daily` (14 days, `LOG_DAILY_DAYS`), `slack`, `papertrail`, `stderr`, `syslog`, `errorlog`, `null` exist. `LOG_LEVEL` default `debug`; `.env.example` sets `LOG_LEVEL=warning`, so with the example env the many `Log::info` lines (station started/stopped, lifecycle event reported, harbor refusals) are not written. Because the `single` channel never rotates, Alloy tails an ever-growing file unless `LOG_STACK=daily` is set (the Alloy glob `*.log` also matches dated daily files).

## Health endpoints

- `GET /up`: Laravel's built-in health route (`withRouting(health: '/up')` in `bootstrap/app.php`). Ignored in Sentry transactions. The nginx internal vhost proxies it (`infra/native/nginx/gocast-api.conf`), and `deploy-native.sh` curls `http://127.0.0.1:${INTERNAL_API_PORT}/up` to confirm the deploy. It checks that the app boots, not the DB or Redis.
- `/api/internal/metrics` doubles as a deeper check (Redis up, Docker reachable) but needs the key.
- Per-station state: `StationStatusService` and `GET /stations/{slug}/status` (see [station-lifecycle.md](station-lifecycle.md)).

## Telegram alerts

Operator alerts to one chat. `AdminTelegram` (`api/app/Services/AdminTelegram.php`) formats HTML messages and dispatches `SendAdminTelegramAlert` (queued, `afterCommit`, 3 tries, backoff 10 s then 60 s, 10 s HTTP timeout, `->throw()`). Inert when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_ADMIN_CHAT_ID` is blank (checked at dispatch and again in the job; `phpunit.xml` blanks the token). A queue worker must be running.

| Alert | Trigger (`AppServiceProvider` model hooks) |
|---|---|
| New registration (email vs Google, invite flag) | `User::created` |
| Access request new or updated | `WaitlistEntry::created` / `updated`; only when status is `pending` and, for updates, `social`/`message`/`status` changed |
| New station (with admin link) | `Station::created` |
| Broadcast started (source, client, Listen and Admin links) | `StreamSession::created`, unthrottled on purpose |
| Email received (from/to/subject/body, first 3000 chars, failed SPF/DKIM flags, attachment names) | Resend `email.received` webhook, `App\Webhooks\Resend\EmailReceived` |

Not alerted: errors, container failures, queue failures, station stops, failed deploys. Failure alerting is Sentry only. See [admin-panel.md](admin-panel.md) and [notifications-and-email.md](notifications-and-email.md).

## Gaps and traps

1. `station_events` must never drive product logic: writes are best-effort, container events over 60/min/station are dropped, rows vanish after 30 days. The only readers are the admin timeline and its tests.
2. The container-event endpoint's `Cache::put('station-event:{id}')` has no reader. Dead code (`StationEventController::CACHE_PREFIX`).
3. A comment in `StationLifecycleService::start` claims the implicit start on publish is logged as a `started` event. No such path exists; the only caller is the power button, so `reason` is always `owner`. Reconcile relaunches and container restarts record nothing but the container's own `boot`.
4. `stopped.forced` records `$force`, which no caller sets, so it is always `false`. The owner's `force` request flag maps to `cutExternal`, which is not recorded as such; a cut of an external encoder shows only as `reason = owner_cutoff`.
5. `icecast_error` carries no error text (the migration comment says it would). `via`/`client` only appear on `live_connected` from a container rendered from the current template.
6. Rate-capped container events are dropped silently and unrecorded. A flapping station's timeline has a gap and the endpoint's side effects still run.
7. Timeline folding is per page (50 rows), so runs across a page boundary show twice. `causerLabel()` is a query per row.
8. `activity_log` has `clean_after_days = 365` but `activitylog:clean` is not scheduled, so nothing prunes it. `authentication_log` has no pruning either, and nothing reads it (no admin UI). Its `location` and `cleared_by_user` columns are never written.
9. `authentication_log` only sees flows that fire Laravel `Login`/`Failed`/`Logout`: email/password login and the admin panel. Google sign-in, registration and token requests are not logged, failed logins for unknown emails are not logged, and user logouts (token deletion) never stamp `logout_at`.
10. No timeline is exposed to station owners; support must use the admin page.
11. `/api/internal/metrics` is not scraped by anything in the repo (Alloy scrapes host metrics only); the alert hints in comments ("alert on this") have no alert rules behind them. Queue metrics assume the `database` queue driver.
12. Mobile has no crash reporting.
13. Sentry filters (Outlook Safe Links, Java-object, xbrowser) apply to the browser SDK only. `app/error.tsx` and `dashboard/error.tsx` do not call Sentry directly; only `global-error.tsx` does.
14. Sentry prod is gated on `NEXT_PUBLIC_SENTRY_DSN` being present at build time (it is inlined). Setting it only at runtime does nothing for the browser bundle.
15. `LOG_LEVEL=warning` in `.env.example` hides all `Log::info` lifecycle lines; `LOG_STACK=single` never rotates.
16. Clarity, GA and Umami load on every route including the dashboard and studio, with no consent gate; masking rules live outside the repo.
17. The Google Translate patch changes global DOM prototypes for every user, not just translated sessions; a future React or browser change could interact with it.
18. Telegram has no throttle or dedupe by design; a reconnecting encoder produces one "Broadcast started" per new `StreamSession`.

## Tests

- `api/tests/Feature/StationEventLogTest.php`: container events recorded, unknown rejected, attribution (container/owner/system/admin), never throws, per-minute cap, owner not silenced by a noisy container, cascade on force-delete.
- `api/tests/Feature/StationEventControllerTest.php`, `StationEventBroadcastTest.php`: endpoint and broadcast subset.
- `api/tests/Feature/StationEventTrackLogTest.php`: upload/delete events.
- `api/tests/Feature/Console/PruneStationEventsTest.php`: retention, disabled, backlog over one chunk.
- `api/tests/Feature/Admin/StationTimelineTest.php`: admin only, ordering, isolation, folding, filters, trashed stations.
- `api/tests/Feature/Observability/ActivityLogTest.php`, `AuthenticationLogTest.php`.
- `api/tests/Feature/MetricsControllerTest.php`, `AdminTelegramAlertTest.php`.
- No tests for the client Sentry config or the Translate patch.

## History

Plans and notes: memory and `docs/` entries on the station event log (2026-09-09), audio-based auto-stop, resend webhooks, Clarity, Google Translate crash (shipped in 045b494) and the Outlook Safe Links filter (92746ab). These are context only; this file is the spec.
