---
feature: Listener analytics (live count, sessions, Audience page)
verified: 2026-09-29 against ea570df plus uncommitted work
sources:
  - api/app/Http/Controllers/ListenerSessionController.php
  - api/app/Http/Controllers/ListenerCountController.php
  - api/app/Http/Controllers/AudienceController.php
  - api/app/Http/Controllers/MetricsController.php
  - api/app/Services/ListenerAnalytics.php
  - api/app/Services/AudienceReport.php
  - api/app/Services/GeoResolver.php
  - api/app/Services/UserAgentParser.php
  - api/app/Models/ListenerSession.php
  - api/app/Models/ListenerStatHourly.php
  - api/app/Models/ListenerGeoDaily.php
  - api/app/Console/Commands/SweepListenerSessions.php
  - api/app/Console/Commands/PruneListenerSessions.php
  - api/app/Console/Commands/RollupListenerStats.php
  - api/app/Console/Commands/SyncListenerCounts.php
  - api/routes/api.php
  - api/routes/console.php
  - api/config/analytics.php
  - api/app/Providers/AppServiceProvider.php
  - api/bootstrap/app.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Models/Station.php
  - api/app/Policies/StationPolicy.php
  - api/database/migrations/2026_08_30_120000_create_listener_sessions_table.php
  - api/database/migrations/2026_08_30_120100_create_listener_stats_hourly_table.php
  - api/database/migrations/2026_08_30_120200_create_listener_geo_daily_table.php
  - api/database/migrations/2026_08_30_120300_drop_total_listener_minutes_from_stream_sessions.php
  - api/database/migrations/2026_09_01_100000_add_analytics_days_to_plans_table.php
  - api/database/migrations/2026_09_02_100000_raise_plan_listener_caps.php
  - client/app/dashboard/stations/[slug]/audience/page.tsx
  - client/app/dashboard/stations/[slug]/audience/HowWeCount.tsx
  - client/app/dashboard/stations/[slug]/audience/NoListenersYet.tsx
  - client/components/dashboard/audience/AudienceBreakdown.tsx
  - client/components/dashboard/audience/AudienceChart.tsx
  - client/components/dashboard/audience/AudienceUpsell.tsx
  - client/components/dashboard/LiveListeners.tsx
  - client/hooks/useListenerSession.ts
  - client/hooks/useListenerCount.ts
  - client/hooks/usePublicStationStats.ts
  - client/hooks/useBroadcastStats.ts
  - client/hooks/useStreamPlayback.ts
  - client/components/dashboard/BroadcastMiniController.tsx
  - client/components/homepage/heroSection/HeroStationPlayer.tsx
  - client/app/station/[slug]/PlayerView.tsx
  - client/app/embed/[slug]/EmbedPlayer.tsx
  - client/lib/milestones.ts
  - client/interfaces/Audience.ts
  - mobile/src/app/station/[slug]/audience.tsx
  - mobile/src/broadcast/hooks.ts
  - mobile/src/lib/station.ts
fingerprint: b137cb488652b499
---

# Listener analytics

Two different things share this name. The **live count** ("listening now") is a real-time number: the Icecast listeners polled once a minute, plus the HLS listeners whose browsers checked in during the last 45 seconds. The **Audience page** is a history built from three tables: an hourly rollup (listening time and peak), raw per-listen session rows (arrivals, devices, referrers), and a daily-per-country rollup.

The one thing people get wrong: **only our own web players are counted as HLS listeners.** HLS has no connection to count, so a browser has to announce itself. The player page, the embed and the homepage hero player each ask for a token when audio starts playing and check in every 15 seconds. A third-party app playing the HLS URL is invisible. A third-party app or a VLC on the Icecast mount is counted, but only as a number in the live count and in listening time and peak; it never creates a session row, so it has no device, country or referrer. Nothing in the mobile app plays the station or reports as a listener.

## How a listener is counted, exactly

1. **Token.** When `playing` is true and the player has resolved which transport it actually used, `useListenerSession` POSTs `/api/public/stations/{slug}/listen` with `{transport: "hls" | "icecast"}`. `ListenerSessionController::store` looks the station up by slug (`firstOrFail`, so trashed or unknown is 404), then `ListenerAnalytics::start`:
   - mints a 22-char `Str::random` token, used as the primary key of a `listener_sessions` row (`started_at = last_seen_at = now`, `seconds = 0`, `ended_at = null`);
   - records `country`, `device`, `browser`, `referrer_host` and `visitor_hash` from that one request (see Identity below);
   - writes Redis `listeners:token:{token}` = `"{stationId}:{transport}"` with TTL `max_session_hours * 3600 + 3600` (13 h at the default);
   - adds the token to the sorted set `listeners:live:{stationId}:{transport}`, scored by the current unix time.
   - The response is 201 `{data: {token, beat_every}}`. `beat_every` is `analytics.beat_interval_seconds`; the client uses `Number(beat_every) || 15`.
2. **Check-in.** Every `beat_every` seconds the client POSTs `/api/public/listen/{token}/beat`. `beat()` reads the token key and `ZADD`s the new timestamp. It writes no database row. Unknown token: 404 `{"message": "Unknown listener session."}`; success: 204. The client fires these with `keepalive` and ignores the response, so a 404 is never acted on (see traps).
3. **Goodbye.** On `pagehide`, or when the effect cleans up (pause, stop, unmount, slug or transport change), the client sends `navigator.sendBeacon(.../listen/{token}/end)` (falls back to a keepalive fetch). `end()` removes the token from the live set, deletes the token key, and closes the open session with `ended_at = now`. It always answers 204, even for an unknown or already-closed token.
4. **Sweep.** `listeners:sweep` (every minute) closes sessions whose tokens have gone quiet for `idle_close_seconds` (60), at their **last check-in** time, then samples concurrency. Details below.
5. **A pause is a new session.** The effect depends on `[slug, playing, transport]`. Pausing tears the session down, and pressing play opens a fresh token. So "sessions" counts plays, not visits, and a listener who pauses and resumes is two sessions.

The client only starts a session when `playing && transport`. `transport` is what actually carried the audio: `useStreamPlayback` sets `"hls"` when hls.js parses the manifest, and `"icecast"` when there is no HLS URL (`hls_base_url` empty, so `hls_url` is null), the browser can't do HLS, or hls.js gave up and fell back (`playIcecast`).

### The live count

`ListenerAnalytics::liveCount(station)`:

```
live = ZCOUNT(listeners:live:{id}:hls, now - live_window_seconds, +inf)   // HLS sessions that beat in the last 45 s
     + int(GET listeners:{id})                                            // Icecast, written by stations:sync-listeners
```

- **Only the `hls` set is added.** The `icecast` set is never counted, because an Icecast listener already sits inside `listeners:{id}`. A session on the Icecast transport still gets a row (country, device, duration) and is still closed on time.
- `listeners:{id}` is written by `stations:sync-listeners` every minute with TTL **300 s** (`SyncListenerCounts::REDIS_TTL_SECONDS`). If the scheduler stalls for more than 5 minutes the Icecast half silently becomes 0. The Icecast half moves in minute-sized steps whatever the client's poll rate.
- `liveCount` is read-only and does not trim the set; trimming is the sweep's job.
- **Icecast listeners are per-mount from `/admin/stats`.** They include any client on the mount, including our own player when it fell back. There is no per-listener identity.

### The transport rules, summarised

| Player state | Session row | In live count | Why |
|---|---|---|---|
| Our player, HLS | yes, `transport=hls` | yes (HLS set) | HLS is invisible to Icecast |
| Our player, fell back to Icecast | yes, `transport=icecast` | no (already in Icecast poll) | would double count |
| External Icecast client (VLC, etc.) | none | yes (Icecast poll) | holds a socket |
| External HLS client | none | **no** | nothing reports it |
| Player that sends no `transport` | uses `ANALYTICS_PLAYER_TRANSPORT` (default `hls`) | as per that value | fallback for old clients |

`ANALYTICS_PLAYER_TRANSPORT` is the double-count trap. If it is set to `icecast` while players actually use HLS, HLS listeners drop out of the live count. If it is left as `hls` for a client that really used Icecast, that listener is counted twice. Every current player names its transport, so the setting only matters for a client too old to say. An unrecognised value in the request is a 422 (`Rule::in`), which the client swallows, so that listener gets no session.

## Identity: what is stored per session

`listener_sessions` (created 2026-08-30):

| Column | Meaning |
|---|---|
| `id` | char(22) token, primary key, non-incrementing string |
| `station_id` | FK, cascade delete |
| `transport` | enum `hls` / `icecast` |
| `country` | char(2), nullable (see Geo) |
| `device` | string(16): `tablet`, `mobile`, `player`, `desktop`, or null (no UA) |
| `browser` | string(32): `Edge`, `Opera`, `Samsung`, `Firefox`, `Chrome`, `Safari`, `Other`, or null (no UA) |
| `referrer_host` | host of the `Referer` header only, leading dots stripped, limited to 250 chars; null if absent or unparseable |
| `visitor_hash` | char(64) `hash_hmac('sha256', ip, APP_KEY . ':' . today's UTC date)`; null if there's no IP |
| `started_at`, `last_seen_at`, `ended_at`, `seconds` | lifecycle; `seconds` is 0 until closed |

Indexes: `(station_id, started_at)`, `(ended_at, last_seen_at)`, `(started_at)`. No IP is stored. There are no `created_at`/`updated_at`.

- **Geo** (`GeoResolver::country`): first the CDN header named by `ANALYTICS_COUNTRY_HEADER` (default `CF-IPCountry`), accepted only if it matches `^[A-Z]{2}$` and isn't `XX` or `T1`; otherwise a MaxMind GeoLite2-Country lookup on `$request->ip()`. The lookup returns null for private and reserved addresses, if the `GeoIp2\Database\Reader` class is missing, the file at `ANALYTICS_GEOIP_DATABASE` isn't readable, or the address isn't in the database. A corrupt file logs a warning once per process. The client IP is real only because `bootstrap/app.php` trusts all proxies (`at: '*'`); the CDN header is trusted for the same reason (Laravel is assumed not internet-facing).
- **Visitor hash** rotates at UTC midnight, so the same person on two days is two hashes. It is the only way to count uniques, and it can only ever be counted per day.
- **User agent** (`UserAgentParser`): device order is tablet (`iPad|Tablet|PlayBook|Silk`), mobile (`Android|iPhone|iPod|Mobile|IEMobile|Opera Mini`), player (`VLC|mpv|foobar2000|Winamp|iTunes|AppleCoreMedia|Sonos|Roku`), else desktop. Browser order is Edge, Opera, Samsung, Firefox, Chrome, Safari, else Other. Empty/absent UA gives null for both. The `player` device can occur only if a non-browser client calls `/listen` itself; none of our players do.

## Scheduled work

All in `api/routes/console.php`, all `withoutOverlapping()->runInBackground()`.

| Command | Schedule | What it does |
|---|---|---|
| `stations:sync-listeners` | every minute | GET Icecast `{services.icecast.url}/admin/stats` (basic auth, 5 s timeout), parses `<source mount><listeners>`, and for **every** non-trashed station writes `listeners:{id}` = count for `icecast_mount` (0 if absent), TTL 300. Fails (exit 1, previous values kept until TTL) if credentials are unset, Icecast is unreachable, non-2xx, or XML is unparseable (an unparseable body gives an empty map, so every station is reset to 0). |
| `listeners:sweep` | every minute | See below. |
| `listeners:rollup` | hourly at :05 | Recomputes session-derived columns. See below. |
| `listeners:prune` | daily 04:20 | Deletes `listener_sessions` older than `retention_days` in bounded chunks (`--chunk=1000`, minimum 100). No-op when `ANALYTICS_RETENTION_DAYS=0`. |

The **one-minute interval of the sweep is load-bearing**: samples are one minute apart, so summing them is listener-minutes. Changing the schedule changes what the column means.

### `listeners:sweep`, per station (every non-trashed station row, running or not)

1. For each transport (`hls`, `icecast`): read tokens with score `<= now - idle_close_seconds (60)` (with their scores), close those sessions with `ended_at` = their last check-in and `seconds = max(0, ended - started)`, then `ZREMRANGEBYSCORE` them out of the set. Then bulk-update `last_seen_at = now` on open sessions for tokens still inside the live window (45 s), in chunks of 500. That write exists only so the database can stand alone if Redis is flushed.
2. `count = liveCount(station)` (HLS in window + Icecast).
3. `recordSample(station, count)`: if `count > 0`, one MySQL upsert into `listener_stats_hourly` for the current UTC hour: `peak_listeners = GREATEST(...)`, `listener_minutes += count`, `sampled_minutes += 1`. A count of 0 writes nothing (rows are sparse; a missing row means zero).
4. `recordPeak`: if `count > 0`, bump `stream_sessions.peak_listeners` on the station's open broadcast (`ended_at IS NULL`) with a conditional `UPDATE ... WHERE peak_listeners < count`. During AutoDJ there is no open broadcast, so nothing is written.

After the station loop: `closeOverdue` closes every still-open session with `started_at < now - max_session_hours (12 h)` **or** `last_seen_at < now - 60 s`, ending it at its own `last_seen_at`. This is the backstop for orphans left by a Redis flush and for the 12-hour cap (a tab left open is closed at its last DB-refreshed `last_seen_at`, but see the resurrection trap: it can start counting as live again). The same query also closes a genuinely live session if the sweep itself stalls for more than 60 s, because `last_seen_at` is only refreshed by the sweep; that listener's next beat resurrects them the same way.

### `listeners:rollup` (idempotent, recompute not accumulate)

- **Hourly** (`--hours=13`): from `listener_sessions` with `started_at >= now - 13h` (start of hour), grouped by station and start hour: `sessions_started = COUNT(*)`, `unique_listeners = COUNT(DISTINCT visitor_hash)`, `qualified_listens = closed sessions with seconds >= min_listen_seconds`. Upserts those three columns only; `peak_listeners`, `listener_minutes`, `sampled_minutes` are never touched.
- **Country** (`--days=3`): from **closed** sessions with a non-null country and `started_at >= start of (today - 3 days)`, grouped by station, day, country: `sessions = COUNT(*)`, `listener_seconds = SUM(seconds)`. Upserts `listener_geo_daily`. It refuses (prints an error and does nothing) if `--days >= retention_days`, so it can't overwrite history with pruned zero rows.

The window is 13 hours so a maximum-length (12 h) session has always closed before its starting hour drops out of the window.

## Metric definitions (what each number is, and where it comes from)

| Metric | Formula | Source table | Includes Icecast? |
|---|---|---|---|
| **Listening now** (`live`) | HLS tokens with a beat in the last 45 s + `listeners:{id}` | Redis | yes |
| **Listening time** (`totals.listener_minutes`, `daily[].listener_minutes`) | sum over days of `SUM(listener_minutes)` per UTC day; each hourly value is the sum of once-a-minute `liveCount` samples taken while count > 0 | `listener_stats_hourly` | yes |
| **Peak at once** (`totals.peak`) | `MAX(peak_listeners)` over the window (per day `MAX`, then the max of the daily values; never a sum). The unit is "highest once-a-minute sample", not an instantaneous peak | `listener_stats_hourly` | yes |
| **Peak all time** (`peak_all_time`) | `MAX(peak_listeners)` over every hourly row of the station | `listener_stats_hourly` (never pruned) | yes |
| **Listens / sessions** (`totals.sessions`, `daily[].sessions`) | `COUNT(*)` of sessions with `started_at >= window start`, per UTC day of start | `listener_sessions`, live | no |
| **Daily listeners** (`totals.listeners`) | per day `COUNT(DISTINCT visitor_hash)`, **summed across days**. A person on two days counts twice; sessions with a null hash are ignored by `DISTINCT` | `listener_sessions`, live | no |
| **Average listen** (`avg_listen_seconds`) | `round(AVG(seconds))` over sessions with `ended_at IS NOT NULL` and `started_at >= window start` (includes very short sessions) | `listener_sessions` | no |
| **Finished listens** | `COUNT(*)` of those closed sessions; the denominator for the average | `listener_sessions` | no |
| **Qualified listens** | closed sessions with `seconds >= min_listen_seconds` (60) | `listener_sessions` | no |
| **Countries** (`countries.rows`, `.total`) | rows: `SUM(sessions)`, `SUM(listener_seconds)` per country from `day >= window start`, top 12 by sessions; `total = SUM(sessions)` over all countries | `listener_geo_daily` | no |
| **Devices / Browsers / Referrers** | `COUNT(*)` grouped by column, nulls excluded, top 12; `total` is a separate count of non-null rows | `listener_sessions` | no |

Other rules that apply to all of them:

- **The window** is `days` UTC days inclusive of today: `start = startOfDay(now) - (days - 1)`. `days = 7` is six full days plus today. The `daily` array is dense (one entry per day, zeros included) so charts don't compress quiet periods. All days are UTC (`config/app.php` timezone is UTC); the client formats day labels as UTC too.
- **Two clocks on one page.** Listening time and peak are exact to the minute (sampled); countries lag (rollup hourly, closed sessions only, up to about an hour after a listen ends). Devices, browsers, referrers, sessions and daily listeners are read live from raw rows, so they include listens still in progress.
- **Today's countries and past-retention.** Country rows for a day only reach `listener_geo_daily` once the session has closed and the hourly rollup has run. Over 90 days old, raw rows are gone but geo rows remain; device/browser/referrer, sessions and uniques are gone after `retention_days`.
- **Shares** (web `AudienceBreakdown`): `round(value / total * 100)`, where `total` is the API's total (not the visible rows); if rows are truncated, the remainder is shown as "Everywhere else" / "Other sites" / "Other". A bar's width is at least 2 percent.
- `AudienceReport::LIST_LIMIT` = 12.

## Endpoints

| Route | Auth | Throttle | Controller |
|---|---|---|---|
| `POST /api/public/stations/{slug}/listen` | none | `listener-start`: 30/min per IP | `ListenerSessionController::store` |
| `POST /api/public/listen/{token}/beat` | none | `listener-beat`: 20/min per **token** | `::beat` |
| `POST /api/public/listen/{token}/end` | none | `listener-beat` | `::end` |
| `GET /api/public/stations/{slug}/listeners` | none | `public`: 60/min per IP, unlimited for the Next.js server when it sends the matching `X-Render-Key` | `ListenerCountController::show` |
| `GET /api/stations/{station:slug}/audience?days=` | Sanctum, `view` policy on the station | 60/min | `AudienceController` (invokable) |
| `GET /api/internal/metrics` | internal key | (no throttle) | `MetricsController` |

The beat and end limiters key on the token so a household or office behind one IP isn't throttled; the ceiling on how many tokens can exist is the per-IP start limit. The three listen routes deliberately live outside the `public` throttle group.

### `GET /public/stations/{slug}/listeners` (polled by every player, embed and dashboard)

Returns `{count, state, is_live, is_on_air, now_playing:{title, artist}}`. `count` is `liveCount`. `state` comes from `StationStatusService` (it asks the container; see [Station lifecycle](station-lifecycle.md)); `is_live = state == live`; `is_on_air = state in (on_air, live)`. Now-playing comes from Redis `metadata:{id}`, overridden by the container's title/artist when the container answers and at least one of them is non-null. The count is returned for any non-trashed station regardless of state (unknown or trashed slug is 404).

### `GET /stations/{slug}/audience`

Plan gate is **by payload, not status code** (`AudienceController`):

- `planDays = user->plan->analytics_days` (no plan row means 0). If `<= 0`: 200 `{locked: true, plan_days: 0, range_days: 0, live, peak_all_time}`. Nothing else is serialised.
- Otherwise `planDays` is clamped to `retention_days` (`AudienceReport::clampWindow`, minimum 1; unclamped if retention is 0). The requested `days` must be in `WINDOWS = [7, 30, 90]`; a value in the list is narrowed with `min(requested, planDays)`; any other value (or none) uses `planDays`. Result: `{locked: false, plan_days, range_days, live, peak_all_time, totals, daily, countries, devices, browsers, referrers}`.
- `analytics_days` is 0 for `free`, 90 for `pro` and any other slug (migration `2026_09_01_100000`). **It gates display only.** Collection is never gated: every station on every plan accumulates the same rows, so an upgrade shows history immediately, and a downgrade hides it without deleting it.
- The gate follows the **logged-in user's plan**, not the station owner's plan. The `view` policy (`StationPolicy::view`) is `user->id === station->user_id` with no admin bypass, so only the owner passes and the requesting user's plan is always the owner's plan; anyone else gets 403 (the web page shows not-found).

### `StationResource.stats` (owner endpoint, also used by the checklist)

- `stats.peak_listeners` = `MAX(listener_stats_hourly.peak_listeners)` for the station, one aggregate query (not from `stream_sessions`).
- `stats.has_listeners` = `peak > 0 OR EXISTS listener_sessions`. Either source saying yes is a yes.
- Also `Station::scopeIndexable` / `isIndexable` treat "has any `listener_stats_hourly` row" as one of three ways a station is indexable for SEO (the others: desired state running, or any broadcast; see [Public player](public-player-and-embed.md)).

### Prometheus (`MetricsController`)

**There are no listener metrics.** It reports stations, containers, stream sessions (`gocast_stream_sessions_*`, which are **broadcasts**), tracks, users, queue depth, harbor auth and Redis liveness. Nothing about listeners, sessions or analytics jobs is exported, so a stopped `listeners:sweep` is invisible to Prometheus.

## Config and env vars (`api/config/analytics.php`, documented in `api/.env.example`)

| Key | Env | Default | Meaning |
|---|---|---|---|
| `player_transport` | `ANALYTICS_PLAYER_TRANSPORT` | `hls` | Transport recorded when the client names none. `hls` or `icecast`; anything else normalises to `hls` |
| `beat_interval_seconds` | `ANALYTICS_BEAT_INTERVAL` | 15 | Sent to the client as `beat_every` |
| `live_window_seconds` | `ANALYTICS_LIVE_WINDOW` | 45 | A session is "live" this long after its last beat. Must stay well above the beat interval |
| `idle_close_seconds` | `ANALYTICS_IDLE_CLOSE` | 60 | Idle time before the sweep closes a session |
| `max_session_hours` | `ANALYTICS_MAX_SESSION_HOURS` | 12 | Hard cap on a session; also sets the token key TTL (+1 h) |
| `min_listen_seconds` | `ANALYTICS_MIN_LISTEN_SECONDS` | 60 | "Qualified listen" threshold (IAB-style) |
| `retention_days` | `ANALYTICS_RETENTION_DAYS` | 90 | Raw session retention; caps the audience window; 0 disables pruning and the cap |
| `geo.maxmind_database` | `ANALYTICS_GEOIP_DATABASE` | `/var/gocast/system/GeoLite2-Country.mmdb` | Optional MaxMind file |
| `geo.country_header` | `ANALYTICS_COUNTRY_HEADER` | `CF-IPCountry` | CDN country header |

Also read: `services.icecast.url/admin_user/admin_password` (`ICECAST_ADMIN_PASSWORD`) for the poll.

## Data model

- `listener_sessions`: above. Pruned nightly.
- `listener_stats_hourly` (`station_id`, `hour` unique, UTC hour): `peak_listeners`, `listener_minutes`, `sampled_minutes` (written by the sweep) and `sessions_started`, `unique_listeners`, `qualified_listens` (written by the rollup). Permanent. Cascade on station delete.
- `listener_geo_daily` (`station_id`, `day`, `country` unique): `sessions`, `listener_seconds` (bigint). Permanent. Attributed to the day the session **started**.
- `stream_sessions.peak_listeners`: per-broadcast high-water mark, fed by the sweep only (see above). `total_listener_minutes` was dropped 2026-08-30 because nothing ever wrote it.
- `plans.analytics_days` and `plans.max_listeners`. `max_listeners` is 100 (free) and 1000 (pro) since migration `2026_09_02_100000`, and **is not enforced by anything**; it appears only in `UserResource.plan.max_listeners`, plan-change/invite email copy (`PlanExpired`, `InviteRedeemed`, `ProAccessGranted`), the web settings page and the mobile account screen.
- Models: `ListenerSession` (scopes `open()`, `qualified()`), `ListenerStatHourly`, `ListenerGeoDaily`; `Station::listenerStats()` is the hourly relation. Do not confuse `ListenerSession` (audience) with `StreamSession` (a broadcaster holding the mic).

## Surfaces

### Web player side (reporting)

`useListenerSession(slug, playing, transport)` is called from `app/station/[slug]/PlayerView.tsx`, `app/embed/[slug]/EmbedPlayer.tsx` and `components/homepage/heroSection/HeroStationPlayer.tsx`. All failures are silent; a failed open just means that listener isn't counted. There is no retry and no re-open after a 404 on a beat.

### Web dashboard

- **Overview** (`LiveListeners`, `bare` in the control strip, or as a card): polls via `useListenerCount(slug, isOnAir)`, only when the station's `state !== "offline"`. The number tweens over 650 ms (instant with reduced motion). `null` renders "—", never 0. Text: off air, "Counting who is tuned in…", "Updates every few seconds", "Nobody right now — your peak is N" (peak = `stats.peak_listeners`), or "Nobody yet. Share your link below." Links to the Audience page for every plan.
- **Shared polling** (`usePublicStationStats.ts`): one feed per slug per tab, 10 s interval (`POLL_MS = 10_000`), paused while the tab is hidden by default, re-read on becoming visible if the held value is 10 s or older; the feed is dropped when its last subscriber leaves. Consumers: the dashboard overview, the player page, the embed, and the homepage hero (only while its audio is playing). The studio and the dashboard mini controller (`useBroadcastStats`) opt out of pausing (`pauseWhenHidden: false`).
- **Studio milestone toasts** (`useBroadcastStats` with `lib/milestones.ts`, used by the studio page and `BroadcastMiniController` while broadcasting outside the studio): thresholds `LISTENER_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000]`. A toast fires once per browser per broadcast per threshold (`localStorage` key `gocast:milestones-fired:v1`, entry `live:{slug}:{liveSince}:{m}`) when the polled count crosses the threshold and the session's own peak was below it. That session peak and the 24-sample sparkline (24 x 10 s, samples at least 5 s apart) are session-scoped in module memory, from the same public endpoint, so they can differ from the sweep's `stream_sessions.peak_listeners`.
- **Audience page** `/dashboard/stations/{slug}/audience[?days=7|30|90]` (server component). Fetches the station and the audience in parallel; 404/403 becomes `notFound()`. The `days` param is validated against `[7, 30, 90]` before it is echoed into links. Range links show only windows `<= plan_days`.
  - **Locked (Free):** two tiles, "Listening now" (hint "station is off air" when `station.state === "offline"`) and "Peak at once" (all time). If live is 0, peak is 0 and `stats.has_listeners` is false: `NoListenersYet` instead. Below, `AudienceUpsell`: a fictional labelled sample chart, four selling points, the price, and a "Upgrade to Pro" button that opens the Pro request dialog. The upsell copy says "90 days"; see traps.
  - **Report (Pro):** `coverage` = `listens` if `totals.sessions > 0`; `stream-only` if none but `listener_minutes > 0`; else `none`. `none` renders `NoListenersYet` with a message chosen from (live > 0: direct-stream listeners will show up within minutes; ever heard: nobody in the last N days plus a "See the last {plan_days} days" link if the plan allows more; never heard). Otherwise four tiles: **Listening time** (`formatAirtime(minutes*60)`; "—"/"not measured yet" if listens exist but no sampled minutes), **Daily listeners** (`totals.listeners`, hint "player page, counted once a day"), **Peak at once** (`totals.peak`, hint includes `max(peak_all_time, totals.peak)` "all time"), **Average listen** (`formatDuration`; "—" until a listen finishes; hint "across N finished listens"). Then the `AudienceChart` and four `AudienceBreakdown` cards, then the folded "How we count listeners" note.
  - **Chart** (`AudienceChart`): one bar per day of `listener_minutes` only. Bar height is scaled to the window maximum, at most 112 px, at least 2 px. Hover shows date, time, peak and listeners in the header. There is a screen-reader table with all four daily values. When no day has minutes it shows the empty sentence passed by the page.
  - **Breakdown empty states** all follow `coverage` (`nobody`, or "Everyone in this window listened on the direct stream. Devices, browsers and locations are only recorded for your player page."). The countries footnote is "Located {countries.total} of {sessions} listens".
  - `HowWeCount` says listening time and peak include direct-stream listeners, the rest is player-page only, days are UTC, records are deleted after 90 days (hard-coded text; it does not follow `ANALYTICS_RETENTION_DAYS`).
- **Sidebar** shows a lock on Audience when `plan.analytics_days <= 0` (`useAudienceLocked`); that is only a badge, the payload is the real gate.
- **Overview/StationActivity/broadcasts pages** show `peak_listeners`: the station overview shows the hourly-rollup peak (`stats.peak_listeners`), while the broadcasts list and recent broadcasts show each broadcast's own `stream_sessions.peak_listeners`.

### Mobile

`mobile/src/app/station/[slug]/audience.tsx` fetches the same endpoint with `useApiData(path, 60_000)`, which reloads on screen focus and then every 60 s while the app is in the foreground. The 7/30/90 selector shows only when the plan allows more than one window.

- Locked: two tiles (listening now, noted "off air" unless `station.is_on_air`; peak all-time) and a "Request Pro" button that opens `/dashboard` on the web. It says "for 90 days".
- Report: empty state "No listeners yet" (never heard: `!stats.has_listeners && peak_all_time == 0`) or "Nobody listened in the last N days" when `sessions == 0 && listener_minutes == 0`. Otherwise a hero of `totals.listeners` plus hours (`listener_minutes / 60`, one decimal under 10), a bar chart (days paired up when there are more than 45, so a 90-day window has 45 bars), peak and average-listen tiles (average is "–" until a finished listen), and top-5 lists for countries, devices and referrers. **It has no browsers card, no "stream-only" coverage handling, and no HowWeCount note.** The country list's bar fractions are relative to the top row, the percentage label to the total.
- The mobile live number polls `/public/stations/{slug}/listeners` every 10 s: `useListeners` on the station home while the station runs and this phone isn't the broadcaster, and `BroadcastContext` while this phone is on air (where it also tracks the show's own peak). Neither pauses in the background. **The app never opens a listener session**: nothing in `mobile/src` calls `/listen`.

## Gaps and traps

1. **A closed session can be resurrected into the live count.** The sweep closes a session and removes it from the live set after 60 s of silence, but nothing deletes `listeners:token:{token}` (only `end()` does; TTL 13 h). If the player then beats again (a laptop waking, a throttled mobile tab), `beat()` still finds the token, `ZADD`s it back, and returns 204. That listener is now in `liveCount` and in every per-minute sample, but has **no open session row** (`refreshLastSeen` and the close only touch open sessions), so it never appears in arrivals, devices or duration. The `beat()` docblock ("false for ... one whose session has already been closed and swept") is wrong; the client ignores a beat's status, so it never re-opens a session either. The effect is under-counted sessions and over-counted listening time relative to them, for anyone who lets the tab sleep past a minute.
2. **Open, closed and the 12 h cap.** `closeOverdue` ends a capped session at its DB `last_seen_at`; combined with trap 1, a tab that keeps beating after 12 h keeps counting as live until it stops.
3. **External HLS clients are not counted at all**, and an Icecast client is counted only in live/listening time/peak (never in sessions, countries, devices or referrers). The Audience page copy says so ("player page only"), but the help article and the dashboard subtitle ("Everyone who pressed play — on your player page and on the direct stream") oversell it: breakdowns exclude the direct stream.
4. **`totals.listeners` is a sum of per-day uniques**, not unique people. Labelled "Daily listeners" for that reason; do not relabel it "unique listeners".
5. **Session means "one play".** Pause then play is a new session (effect dependency on `playing`), so sessions and the average listen are per play, not per visit.
6. **Peak is a sample.** It is the highest of the once-a-minute `liveCount` reads, so a burst shorter than a minute can be missed. The Icecast half is itself up to a minute stale.
7. **Icecast half depends on `stations:sync-listeners`**: a 5-minute stall zeroes it (TTL), and an unparseable stats body resets every station to 0. The sweep then records those zeros as samples.
8. **MaxMind is effectively off.** `geoip2/geoip2` is not in `api/composer.json`, and `GeoResolver` guards on `class_exists`, so without the package and a `.mmdb` file, country comes only from the CDN header. With no Cloudflare in front, `country` is null for every session and the countries card can never fill (the empty-state copy blames "no locations recorded", not configuration). Private and reserved IPs (local dev) are always null.
9. **Countries lag and drop open sessions.** They are rolled up only from closed sessions, hourly at :05, over a 3-day trailing window (`--days=3`); a listen that closes more than 3 days after it started never reaches `listener_geo_daily`. A country's `sessions` therefore can be lower than `totals.sessions`; the page footnote states "Located X of Y".
10. **Rollup columns are write-only.** `listener_stats_hourly.sessions_started`, `unique_listeners` and `qualified_listens`, and `ListenerSession::scopeQualified`, are not read by any report (`AudienceReport` reads sessions directly). `sampled_minutes` is also unread. `totals.qualified_listens` is returned by the API and typed in web and mobile but not displayed anywhere.
11. **`AudienceReport::build` runs 11 database queries per request (daily samples, daily sessions, countries x2, session totals, three breakdowns x2, peak-all-time) plus Redis reads.** That is fine at current scale; it is throttled at 60/min per route.
12. **Stale/incorrect copy:**
    - Help article `read-your-audience-page` says Free sees "the live listener count ... and that is all"; the locked Audience page also shows the all-time peak.
    - The same article says today's bar is always an underestimate; listening time is sampled once a minute so today's bar is only slightly behind, while countries (closed sessions) are what lags.
    - `HowWeCount` hard-codes "90 days" and `AudienceUpsell`/mobile hard-code "90 days" while the real window is `analytics_days` (capped by `retention_days`); the mobile and web upsell say "Upgrade" / "Request Pro" with different labels.
13. **`max_listeners` (100/1000) is not enforced anywhere.** No Icecast, Liquidsoap or API code reads it; it is display copy (`UserResource`, account screen).
14. **Client session edge cases.** If the effect is cleaned up before `/listen` returns (fast pause, navigation), the client discards the token: no beats and no `/end`, so the session sits in the live count for up to 45 s and the sweep closes it about a minute later with `seconds` near 0. After a `pagehide` (back/forward cache) the token is dropped but the effect stays mounted, so a restored page keeps playing with no session and never re-opens one.
15. **No listener or job metrics in Prometheus** (see above), and the sweep is the only writer of most of these numbers.
16. **Listen endpoints accept anything.** `store` doesn't check the station is on air or public, and an unknown `transport` is a 422 the client swallows (that listener gets no session). Abuse is bounded only by the 30/min per IP start limit.
17. **`useListenerCount` and the studio poll both hit the public endpoint**, which runs a container status fetch (`StationStatusService`, short TTL cache) per call; the per-IP `public` throttle is 60/min, which is why the client shares one feed per slug per tab.
18. **Dead-ish:** the `player` device class and the comment that a Laravel-served manifest will create sessions for non-browser clients describe a path that doesn't exist.

## Tests

`api/tests/Feature/`: `ListenerSessionTest` (start/beat/end, HLS+Icecast addition, no double count, 404 unknown station, transport validation), `ListenerIdentityTest` (geo header, private IP, hash rotation, UA parsing), `SweepListenerSessionsTest` (idle close at last check-in, orphans, 12 h cap, sampling, Icecast inclusion, broadcast peak), `RollupListenerStatsTest` (arrivals/uniques/qualified, sample columns untouched, idempotent, geo window guard), `PruneListenerSessionsTest`, `SyncListenerCountsTest`, `AudienceControllerTest` (dense series, max-not-sum peak, per-day uniques, countries from rollup, locked payload, window narrowing, retention cap, ownership, auth), `StationStatsTest` (peak from rollup for AutoDJ-only stations). No test covers the resurrection in trap 1, and none covers the client hooks or the Audience page UI.

## History

Introduced 2026-08-30 (session tokens and rollups), the Audience page 2026-09-01. See the earlier memory notes "Listener analytics" and "Audience page", and the `docs/` plans of the same dates; treat them as background only.
