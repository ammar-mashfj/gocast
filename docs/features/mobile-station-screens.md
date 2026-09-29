---
feature: Mobile station console (Overview, Audience, Schedule, Library, Show times)
verified: 2026-09-29 against ea570df plus uncommitted work
sources:
  - mobile/src/app/station/[slug]/_layout.tsx
  - mobile/src/app/station/[slug]/index.tsx
  - mobile/src/app/station/[slug]/audience.tsx
  - mobile/src/app/station/[slug]/schedule.tsx
  - mobile/src/app/station/[slug]/library.tsx
  - mobile/src/app/show-times/[slug].tsx
  - mobile/src/app/home.tsx
  - mobile/src/components/station/parts.tsx
  - mobile/src/components/station/ScheduleEditor.tsx
  - mobile/src/components/LiveStrip.tsx
  - mobile/src/lib/api.ts
  - mobile/src/lib/station.ts
  - mobile/src/lib/web.ts
  - mobile/src/lib/auth.tsx
  - mobile/src/broadcast/hooks.ts
  - api/routes/api.php
  - api/app/Http/Controllers/StationController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Http/Controllers/ListenerCountController.php
  - api/app/Http/Controllers/AudienceController.php
  - api/app/Http/Controllers/TrackController.php
  - api/app/Http/Controllers/PlaylistController.php
  - api/app/Http/Controllers/PlaylistTrackController.php
  - api/app/Http/Controllers/AutodjSlotController.php
  - api/app/Http/Controllers/StationScheduleController.php
  - api/app/Http/Requests/StoreTrackRequest.php
  - api/app/Http/Requests/DestroyTracksRequest.php
  - api/app/Http/Requests/ReplaceAutodjSlotsRequest.php
  - api/app/Http/Requests/ReplaceStationSchedulesRequest.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Resources/TrackResource.php
  - api/app/Http/Resources/PlaylistResource.php
  - api/app/Services/StationLifecycleException.php
  - api/app/Services/StationStatusService.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/AudienceReport.php
  - api/app/Services/TrackImporter.php
  - api/app/Policies/TrackPolicy.php
  - api/app/Models/User.php
  - api/config/liquidsoap.php
  - api/config/analytics.php
fingerprint: b1f8aaa2c4375a86
---

# Mobile station console

The Android app's station screen is a shell with four bottom tabs (Overview, Audience, Schedule, Library) plus one pushed screen (Show times). It is a thin client over the same owner endpoints the web dashboard uses. It has no endpoints of its own, no cache and no offline mode. Everything below is read from `mobile/src/`.

**The one thing people get wrong:** it looks like a small dashboard, but it is not feature-equal to the web one. It cannot create or rename playlists, reorder or retag tracks, change settings, rotate a stream key, skip a track, or change the timezone. And the Overview's "Show times" and the Schedule tab's slots are two different things (see [Schedule](schedule.md)).

Going live, the studio, and the encoder are documented in [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md). Sign-in, the app shell, routing and the Account screen are in [mobile-app-shell-and-auth.md](mobile-app-shell-and-auth.md). This doc covers the five console screens only.

## How you get here

- `mobile/src/app/home.tsx` calls `GET /stations`, takes **the first station only** (`data[0]`), and `Redirect`s to `/station/[slug]` with `name` as a param. `GET /stations` is `StationResource::collection($request->user()->stations)` with no ordering, so "first" is whatever the database returns first. An account with no station gets a "Create your station" card with **Create on the web** (opens `/dashboard` in the in-app browser); a failed call shows "Couldn't reach GoCast" with the error message and **Try again**. Both states also carry an **Account** button.
- `home.tsx` re-runs on focus, so someone who created their station on the web finds it on return.
- The console never lists more than one station. A second station on an account is unreachable from the app.

## The shell: `station/[slug]/_layout.tsx`

- Reads `slug` (and optional `name`) from the route. Fetches **`GET /stations/{slug}`** once on mount (`useEffect`) and exposes `{ slug, station, error, reload }` through `StationContext` (`lib/station.ts`). `useStation()` throws outside the layout.
- The fetch has no retry and no polling. Only the Overview (`onChanged`, its error card's Try again, pull-to-refresh) and the Schedule tab (every focus, pull-to-refresh) call `reload`; the Library, Audience and Show times screens never touch the shared station.
- **Header:** the signed-in user's avatar (initial letter fallback) -> `/account`; the station name (falls back to the `name` param, then "Station"); a **Share** pill that opens the system share sheet.
- **LiveStrip** (`components/LiveStrip.tsx`) sits above the header while *this phone* is broadcasting (`broadcast.state` is `live` or `reconnecting`, any station): a coral bar (amber when reconnecting) with an uptime clock and "Back to studio".
- **Tabs:** `expo-router/js-tabs` with a custom tab bar. Order and titles: Overview, Audience, Schedule, Library. `headerShown: false`.
- **Share** (`lib/web.ts` `shareStation`) shares `"Listen to {name}: {APP_URL}/station/{slug}"` as both message and url. `APP_URL` is `EXPO_PUBLIC_APP_URL`; empty means a relative, useless link.
- **Error state:** if the station fetch fails, Overview and Schedule show `ErrorNote` ("Couldn't load this" + message + Try again); Audience and Library do not depend on it and load their own data. While loading, Overview and Schedule show skeletons.

## Shared plumbing

**`lib/api.ts`**

| Function | Behaviour |
|---|---|
| `api(path, {method, body})` | JSON fetch to `EXPO_PUBLIC_API_URL + path` with `Accept`/`Content-Type: application/json` and `Authorization: Bearer <token>` when signed in. A network failure throws `ApiError(0, "Could not reach the server at ...")`. A non-2xx throws `ApiError(status, body.message ?? "Request failed (n)", body)`. |
| 401 handling | If the request's own token is still the current token, calls the auth provider's unauthorized handler (ends the session). A slow response from a replaced session does not sign the new one out. |
| `apiUpload(path, FormData)` | Multipart POST, no `Content-Type` (the runtime sets the boundary). Returns `{status, body}` for any 2xx **including 207**. Non-2xx throws `ApiError` with `body.message ?? "Upload failed (n)"`. Network or encode failures throw "Upload didn't go through: <reason>". |
| `mediaUrl(url)` | Rewrites `localhost`/`127.0.0.1`/`0.0.0.0` hosts in stored media URLs to the API's origin, because in dev the API stores absolute URLs from its own `APP_URL`. Real hosts pass through. |

**`lib/station.ts`**

- `useApiData(path, pollMs?)`: `GET path` on screen focus (`useFocusEffect`), optionally every `pollMs` while `AppState` is `active`. Returns `{data, error, reload}`. A `null` path does nothing. After a failure, old `data` is kept and `error` is set; after a success `error` clears. There is no request de-duplication.
- `useStationStatus(slug)`: adaptive poll of `GET /stations/{slug}/status` (the web's cadence, per its own doc comment). Next delay: **2 s** while `state` is `starting` or a live handover is in flight (`source==='live' && broadcaster===false`, or `broadcaster===true && source!=='live'`); **30 s** while `offline`; otherwise `clamp(remaining*1000+750, 3000, 10000)` when `remaining` is known; **10 s** default. On failure: exponential back-off `min(30 s, 2 s * 2^(failures-1))` and `failed=true`. It re-polls immediately when the app returns to the foreground, and `refresh()` lets a power action poll now. Pauses on blur.
- `useTicker(ms)` is a plain interval clock; the Overview uses 1000 ms.
- Formatting helpers (`formatDuration`, `formatBytes`, `trackCount`, ...; `formatAgo`, `formatWhen`, `formatDays` and `DAY_SHORT` are unused, see gaps). `formatBytes`: GB with one decimal, MB rounded, else KB (min 1).
- `SOURCE_LABEL`: `browser` -> "Studio", `electron` -> "Desktop", `external` -> "Encoder".
- The TypeScript interfaces here are hand-copied from the API resources. They are not generated, and the API's `encoder` block (which includes the stream key) arrives in `GET /stations/{slug}` but is not declared in `Station` and is never read.

**`components/station/parts.tsx`**: `StationScreen` (scroll body with pull-to-refresh; the spinner runs until the passed promise resolves), `Section`, `StatTile`/`TileRow`, `BarRow` (min fill width 2%), `ErrorNote`, `EmptyNote`, and skeletons (`OverviewSkeleton`, `ListSkeleton`, `RowsSkeleton`).

**Plan gate on the phone:** `useAutoDjLocked()` (`lib/auth.tsx`) is true only when the user's plan is known **and** `plan.autodj_enabled` is false. An unknown plan (null) is treated as unlocked, on purpose (mirrors the web hook). The app does not read `analytics_days`; the Audience tab lets the API's payload decide.

## Overview (`index.tsx`)

**Data and polling**

| Data | Endpoint | Refresh |
|---|---|---|
| Station (name, artwork, `state`, `stats`, `schedules`) | `GET /stations/{slug}` via the shell | On mount; after any power action; pull-to-refresh |
| Container truth | `GET /stations/{slug}/status` via `useStationStatus` | Adaptive, see above (route throttle 120/min) |
| Recent shows | `GET /stations/{slug}/sessions` (paginated, 20 per page, latest first; the phone reads page 1 and `total`) | Focus + every 30 s |
| Listener count | `GET /public/stations/{slug}/listeners` via `useListeners` (`broadcast/hooks.ts`) | Every 10 s (`LISTENERS_POLL_MS`) |

The count is polled **twice** while the station runs and this phone is not live: once in `Hero`, once in `Stats` (two hooks, same endpoint). The two hooks disagree slightly on "live here" (`Hero` counts `reconnecting`, `Stats` only `live`).

**Derived flags** (in `Loaded`)

- `state = status.state ?? station.state`; `running = state !== 'offline'`. The API's status `state` is `offline` not only for a stopped station but also when the container has not answered and Docker says it is not up (`StationStatusService::state`), even while `desired_state` is `running`. In that window the phone shows the grey OFF AIR card, offers Go live / Start AutoDJ, and hides "Turn station off".
- `liveHere` = this phone's `BroadcastContext` is on this station and `live` or `reconnecting`.
- `attached` = running and (`liveHere` or (`status.reachable` and (`status.broadcaster ?? status.live_source !== null`))). That is "somebody is on air: this phone, another browser, or an encoder".
- `liveFromAnotherBrowser` = attached, not here, and `live_source.type === 'browser'`.
- `canTurnOff` = running, not `liveHere`, not `liveFromAnotherBrowser`.

**Hero card, three shapes**

1. **Attached (coral).** Label from `liveSourceLabel`: "LIVE FROM THIS PHONE", "LIVE FROM AN ENCODER" (`live_source.type==='external'`), "LIVE FROM <CLIENT>" (uppercased `live_source.client`), else "LIVE FROM ANOTHER DEVICE". A 48-px mono uptime clock, counted from the broadcast manager's `liveSince` when live here, otherwise from the open session's `started_at` (found in the sessions list; absent means no clock). Then "N listening now" (or "Counting listeners...") plus "peak N" (the broadcast session's peak when here, otherwise the open session's `peak_listeners`). Button: "Open studio" (`/studio/[slug]`) when live here, "Hear your stream" (opens `/station/{slug}` in an in-app browser) otherwise.
2. **Running, no broadcaster (AutoDJ card).** Label: `degraded` -> "NOT REACHING LISTENERS"; `starting` -> "STARTING..."; no status yet -> "CHECKING..." (or "STATUS UNKNOWN" if the poll has failed); `!reachable` -> "STATUS UNKNOWN"; `source==='silence'` -> "NO SOUND"; `source==='live'` (no broadcaster) -> "HANDING BACK TO AUTODJ"; else "ON AIR - AUTODJ". `degraded` and silence use the amber palette. Shows the listener count, then the now-playing block: artwork (only if the station has one), title (falls back to "Nothing is playing" on silence, else "Waiting for the first track"), artist, and a progress bar with elapsed and remaining that **runs on between polls** by adding the drift since the last poll to `elapsed`. Progress needs both `elapsed` and `remaining` from the container. Button: "Go live" (`/live/[slug]`) and the line "AutoDJ hands over when you start, and takes back when you end."
3. **Not running (grey).** "OFF AIR", "Nothing's playing right now.", then **Go live** and, only when `useAutoDjLocked()` is false, **Start AutoDJ**. The line under the headline is "Go live, or start AutoDJ to keep your library playing." and changes for Free to "Your station plays while you're live. AutoDJ, which keeps it going between shows, is Pro."

An action error (start/stop failure) renders as a line inside the hero, not a toast, and stays until the next action.

**Power controls** (`usePower`)

| Action | Call | Notes |
|---|---|---|
| Start AutoDJ | `POST /stations/{slug}/start` (throttle 20/min) | `busy='start'`; on success runs `onChanged` (reload station, poll status, reload sessions). API returns 202; the container needs a few seconds, so the card shows STARTING... until status says otherwise. |
| Turn station off | `POST /stations/{slug}/stop`, no body | Button "Turn station off" at the foot of the page, **only when `canTurnOff`**. If the source is `autodj` and nothing is attached, the phone asks first (bottom sheet: "Turn <name> off?" / "Keep it on"). Otherwise it stops immediately. Disabled until a status snapshot exists. |
| Force stop | Same call with `{force: true}` | Only offered after the API answers **409 `station_is_live_external`** (an encoder is on air). The sheet becomes "Cut the broadcast off?" with the API's message and "Cut it off". Any other error code closes the sheet and shows the error line. |

Errors are read from `ApiError.body.code`. The API's codes for these calls come from `StationLifecycleException`: `station_limit_reached` (422, plan allows N stations on air), `station_is_live` (409, browser broadcast: "End the broadcast before taking it off air."), `station_is_live_external` (409), `station_start_failed` (503), and `autodj_not_available` (403, uploads only).

- A browser broadcast (here or on another device) hides "Turn station off" entirely, but only while the phone can see it. The 409 `station_is_live` error line is still reachable when the phone cannot: the status poll has not reached the container (`attached` needs `reachable`), the container reports `broadcaster:false` while a session row is still open (the handback window), or the open session is `electron` (`liveFromAnotherBrowser` only matches `browser`). The API refuses on any open session row (`StationLifecycleService::stop`).
- Start does not check the plan. The only AutoDJ gate on the phone is that the button is hidden for Free. The API's `start` does not check `autodj_enabled` either (see `StationLifecycleService::start`); the audio-path plan gate is in `AutoDjScheduler::next` (see [autodj.md](autodj.md)).

**Stats row** (`StatTile` x3, from `station.stats`, which `GET /stations/{slug}` loads because it loads `streamSessions`):

| Tile | Value | Note line |
|---|---|---|
| LISTENING | live count (`-` while unknown; `0` when not running) | `peak {stats.peak_listeners}` |
| SHOWS | `stats.sessions` (closed sessions only) | "all time" |
| AIRTIME | whole hours (`Nh`), else whole minutes | "N min" remainder, or "live, all time" |

`stats` is only present because `StationController::show` loads `streamSessions`; `GET /stations` (used by `home.tsx`) omits it, along with `schedules`, `autodj_slots`, `programme` and `encoder`. `stats.peak_listeners` is the all-time hourly-rollup peak (AutoDJ audiences included), not the peak of live shows. "AIRTIME" is the sum of closed **stream sessions** (live broadcasts only), so a station that has only run AutoDJ shows 0m. That is why the note says "live, all time" and not "on air". See [listener-analytics.md](listener-analytics.md) for how the peak is produced.

**"Your link" card**

- The player URL (`APP_URL/station/{slug}` with the scheme stripped) as a tappable well that opens the page in an in-app browser (`openWeb`, Custom Tab with `enableBarCollapsing`), plus a **Share** button (same share sheet as the header). Footnote: "Listeners open it in any browser. No app, no account."
- A **Show times** row underneath: summary "None yet. Tell listeners when you're usually on." or "N on your player page" (`station.schedules.length`), which opens `/show-times/[slug]`.

**Recent shows card**: up to **4 finished** sessions (client-filtered from the first 20 the API returned) with when ("Today, 22:04", "Yesterday, ...", weekday, or "12 Sep, 22:00", 24-hour), source label and peak, a length bar scaled to the longest of those four, and `Xh 05m` or `Nm`. Empty text: "No shows yet. They appear here after you go live." The "All N" link (shown when `total > finished.length`, so it also appears when there is an open session or more than 4) opens `/dashboard/stations/{slug}` on the web. The API's `total` includes the open session.

**Free vs Pro on Overview:** the only difference is that Start AutoDJ is hidden and the off-air copy changes. Everything else is identical.

## Audience (`audience.tsx`)

- Endpoint: `GET /stations/{slug}/audience[?days=N]` (throttle 60/min), refetched every 60 s and on focus. Initial call has no `days`.
- The API answers **200 for every plan**; entitlement is in the payload (`AudienceController`). `analytics_days <= 0` (Free, or a user with no plan row) returns `locked: true` with only `live` and `peak_all_time`. Otherwise `plan_days` is clamped to the retention config (default 90) and `days` is honoured only when it is 7, 30 or 90 (`min(requested, plan_days)`), else the plan's window.
- Range picker: a `7d / 30d / 90d` segmented control, shown only when more than one option is `<= plan_days`. A Pro plan gets all three. Default is the plan's own window (90), so the first paint is the 90-day view.

**Locked (Free)**: two tiles, LISTENING NOW (`live`; note "right now" if `station.is_on_air`, else "off air") and PEAK (`peak_all_time`, "all time"), then a Pro card: "See who tuned in, from where, for how long." and a **Request Pro** button. That button just opens `/dashboard` on the web in the in-app browser. It is **not a request**; the request flow (if any) lives on the web ([accounts-plans-invites.md](accounts-plans-invites.md)).

**Report (Pro)**

- Empty window (`sessions === 0 && listener_minutes === 0`): "No listeners yet / Share your link from the Overview tab..." if the station has never been heard (`!stats.has_listeners && peak_all_time === 0`), else "Nobody listened in the last N days."
- Headline: `totals.listeners` (localised) and "listeners - N hours heard" (`listener_minutes/60`, one decimal under 10 hours, rounded above).
- **Bar chart** of `daily[].listener_minutes` scaled to the tallest bar (120 px high, min height 4% for non-zero, 2% for zero). Over **45 bars** (`MAX_BARS`) the days are paired/grouped from the end so the last bar stays "today"; with a 90-day window that means 2 days per bar. The last bar is the bright colour. Axis labels "N days ago" / "Today". No tooltips, no per-day numbers.
- Tiles: PEAK (`totals.peak`, note = the busiest day, "Mon 27 Sep", or "at once") and AVG. LISTEN (`formatDuration(avg_listen_seconds)`, "-" when `finished_listens` is 0, note "per session"). The Pro window is 90 because the plans migration sets `analytics_days` to 90 for Pro and `ANALYTICS_RETENTION_DAYS` defaults to 90.
- "Where they're listening": top **5** countries from `countries.rows` (the API returns up to 12 per list, `AudienceReport::LIST_LIMIT`, ordered by sessions descending; the bar length is relative to the first row), each labelled with its share of `countries.total` (Intl `DisplayNames`, falling back to the code); hidden when there are none. "Devices" and "Where they came from" (referrers): top 5 each; a card is hidden when it has no rows.

**Not shown on mobile that the web shows:** browsers breakdown (fetched, never rendered), the sessions and qualified/finished-listen totals, the "How we count" explainer, the note that direct-stream listeners have no device/location, the explanation that countries fill in about an hour after a listen ends, and a link-based range control (web uses `?days=`). The counting rules and the Cloudflare geo dependency are in [listener-analytics.md](listener-analytics.md); nothing here recomputes them.

## Schedule tab (`schedule.tsx`)

This tab is **AutoDJ's programme** (violet, Pro). It also draws show times read-only. The shared logic (resolution, overlap rules, timezone, plan gate, the web week grid) is in [schedule.md](schedule.md); this section is only the phone's behaviour.

**Data:** the shell's `station` (which has `schedules`, `autodj_slots`, `programme`, `timezone`, `is_on_air`, `is_live`) and, **only when not locked**, `GET /stations/{slug}/playlists` (name, track count, order). The tab calls the shell's `reload()` **on every focus** so it picks up Show times edits and the current `programme`. Pull-to-refresh reloads both.

**Layout:** a Monday-first week strip (SUN..SAT labels with this week's date numbers, from the phone's clock). The selected day defaults to today. A small coral dot marks a day that has any show time. A list of rows for the selected day, sorted by start time as a string.

| Row | Shown to | Content | Tap |
|---|---|---|---|
| Show time (coral) | everyone | start time, label or "Show time", "Show time - on your player page" | opens `/show-times/[slug]` |
| AutoDJ slot (violet) | Pro only | "HH:mm - HH:mm", label or playlist name or "AutoDJ", "AutoDJ - N tracks on shuffle / in order" | opens the slot editor |
| Default playlist, "All day" (violet) | Pro only, when **no slot covers that weekday** | default playlist name (else "Default playlist") and the same "AutoDJ - N tracks on shuffle / in order" line | nothing |

- **NOW badge** on a slot (or on the all-day default row): only when the selected day is the phone's today, the station `is_on_air && !is_live` (intent-derived, from the station payload, not the container), and `station.programme.slot_id` equals the slot (or is empty for the default row). The programme is computed server-side at fetch time and this tab does not poll, so NOW can be stale until the next focus or pull. It also assumes the phone and the station are in the same timezone: "today" is the phone's date, while slots are in the station's zone.
- **Free:** no "+ Add" button, no slot or default rows, no playlists fetched. With no show times that day the empty note reads "Scheduling what AutoDJ plays is part of Pro. Your show times are under Show times on the Overview." A Free owner with show times sees them here as read-only coral rows.
- Empty day on Pro (cannot really happen, because the default row fills in): "Nothing scheduled on <day>."
- Footer: "Times are in <timezone>. Change it in Station settings on the web." Only when the station has a timezone. With no timezone there is **no hint at all** (see gaps).

**Adding and editing** (Pro): **+ Add** creates a draft `{days:[selected day], 06:00-12:00, first non-default playlist (else the first)}` and opens `ScheduleEditor` as a bottom sheet. Tapping a slot opens the same sheet with that slot. Saving builds the **full list** from `station.autodj_slots` (label, playlist_id, days, start_time, end_time), pushes/replaces/splices the one changed row **by array index** (the API returns slots ordered by `position`, which matches), and sends **`PUT /stations/{slug}/autodj-slots`** with `{slots: [...]}`. It sends **no `timezone`**, so the API keeps the station's. API rules (`ReplaceAutodjSlotsRequest`): up to 50 slots, label up to 60, 1 to 7 days each, `H:i` times, the playlist must belong to the station, and overlapping windows are refused ("Slots can touch but not overlap", overnight and week-wrap included). The endpoint itself does **not** check the plan; the Pro gate here is the phone hiding the controls. The call is not optimistic; on success the shell station is reloaded and the sheet closes. On failure the API's message shows in the sheet (validation `message`, first error), and the sheet stays open.

One row = one slot, and a slot can span several weekdays. The phone edits **all days of that row at once** through the day chips; there is no per-day edit like the web grid's edge drags. Editing a multi-day slot from a day's list changes every day it covers.

## Show times screen (`show-times/[slug].tsx`)

A separate stack screen (not a tab), reached only from the Overview link card or by tapping a coral row on the Schedule tab. **Every plan.** It fetches its **own** copy of `GET /stations/{slug}` (`useApiData`), not the shell's, so after a save the shell's station is stale until the Schedule tab refocuses or the Overview reloads (the Overview's summary count therefore lags until a reload).

- Rows: start time, label or "Show time", the days (Monday first, comma list). Empty: "None yet. Add the times you're usually on air."
- "+ Add" opens `ScheduleEditor` with `{kind:'show', days:[], start:'20:00'}`. Days must be picked or the sheet says "Pick at least one day."
- Save/delete build the whole list from `station.schedules` and `PUT /stations/{slug}/schedules` with `{timezone, schedules:[{label, days, start_time}]}`. **`timezone` = `station.timezone ?? the phone's Intl zone`**, so the first save from a phone stamps the phone's zone on the station. There is no timezone picker on mobile. If the station already has one, it is sent back unchanged.
- API rules (`ReplaceStationSchedulesRequest`, `StationScheduleController`): up to 20 rows, label up to 60 chars, 1 to 7 days, `H:i` start time; no overlap check. An empty list is allowed (deleting the last row). A non-empty list needs a timezone (422 "Set the station timezone before adding show times."). Show times have no end time. Like the slots endpoint, it is not plan-gated.
- Under the list the screen shows "Times are in <timezone>. Change it in Station settings on the web." when the station has a zone. The header **+ Add** appears once the station has loaded; the back button falls back to `router.replace('/')` when there is no history. They do nothing except appear on the player page (see [schedule.md](schedule.md)).
- The screen's copy says nothing starts on its own and you still press Go live.

## The schedule editor sheet (`components/station/ScheduleEditor.tsx`)

- One component, two `kind`s chosen by the caller: `show` (coral, "Goes live at") and `slot` (violet, "Starts"/"Ends", with a playlist radio list). There is deliberately **no switch** between them (a "Live show | AutoDJ" picker was removed on 2026-09-29 because it made show times look like programming).
- Fields: Name (max 60), Days (M T W T F S S chips, Monday first, values 0 = Sunday), times, and for slots a playlist list (colour swatch, "N tracks - shuffle / in order").
- Times use Android's native clock dial (`@expo/ui/jetpack-compose` `DateTimePicker`, 24-hour). The dial is seeded when opened and remounted per field; tapping the open field closes it. It is a Jetpack Compose control, so it is **Android-only**.
- A slot whose end is at or before its start shows "Ends (next day)" and is treated by the API as overnight (start equal to end is refused client-side: "The slot needs to end at a different time than it starts.").
- Client checks: at least one day. Everything else (overlaps, missing playlist, missing timezone) is left to the API and its message is shown as the error.
- Delete asks "Delete this <noun>?" inline with Delete / Keep it. New entries have no delete button.
- The sheet's save/delete callbacks are supplied by the parent; the sheet stays open and shows the error if they throw.
- Note: `addHours` is only used to give a slot a two-hour end when its stored end is empty (which the API never returns; it requires `end_time`). The Show times screen passes `playlists={[]}` to the editor.

## Library (`library.tsx`)

**Data**

| Call | Purpose |
|---|---|
| `GET /stations/{slug}/tracks` | All **music** tracks plus `meta.storage_used_bytes` / `storage_cap_bytes`. |
| `GET /stations/{slug}/playlists` | Playlists with `track_count`, `duration_seconds`, `is_default`, `order`, `position`. |
| `GET /playlists/{id}/tracks` | The members of an **opened** playlist, in playlist order. Refetched when opened, on refresh, and when the playlist's count/duration meta changes. |

Both list calls run on focus with no polling. The screen shows a skeleton until both arrive; if either errors before data exists, an `ErrorNote` with Try again.

**Screen**

- Heading "Library" with an action: "+ Add from phone" (hidden for Free, shows "Uploading i of n..." while uploading, disabled then), or "Done" while selecting.
- **Free banner**: "PRO / AutoDJ plays this library between your shows, and adding music is part of it. You can still see what's here."
- A notice line under the heading (green for success, red for errors) that stays until the next upload.
- **Storage card**: `N tracks`, "X of Y" (formatBytes), and a bar. At **95%** or more the text and bar turn red. The cap is `liquidsoap.station_storage_bytes`, default **3 GB** (env `LIQUIDSOAP_STATION_STORAGE_BYTES`). Usage counts music and jingle bytes together.
- Empty library: "No music yet. Add MP3, M4A, FLAC, OGG or WAV files and AutoDJ plays them between shows."
- **One card per playlist**, default first (`is_default` desc, then `position`), each with a rotating colour swatch (`SWATCHES` by index), name, "N tracks - duration", and a chevron. The first card starts open; others load on tap. An open playlist shows a skeleton, an error line, "Empty playlist.", or track rows (number, title, artist, mm:ss or h:mm:ss). Rows page in **50s**: the link reads "Show <next 50 or fewer> more of <remaining>", where the second number is what is still hidden, not the playlist size.
- A "Jingles & IDs" card is coded for (see gaps) but does not appear in practice.

**Upload flow** (`addFromPhone`, Pro only)

1. `DocumentPicker.getDocumentAsync({type:'audio/*', multiple:true, copyToCacheDirectory:true})`. Cancel or none picked returns quietly.
2. A staging directory `cache/upload-<timestamp>` is created; each picked file is **moved into it under its original name** (characters `/ \ : * ? " < > |` become `_`), because the picker's cache copy has a generated name and the API titles untagged tracks by filename.
3. **One file per request**, sequentially: a `FormData` with a single `files[]` part holding an `expo-file-system` `File` (the SDK 57 global fetch rejects RN's old `{uri,name,type}` parts), `POST /stations/{slug}/tracks` via `apiUpload`. Progress reads "Uploading i of n...".
4. A response with a non-empty `errors` array throws its first message, which stops the batch at the file that tripped (typically the quota). Files already added stay.
5. Result notice: "Added N track(s) to your default playlist." or "Added N, then stopped: <message>" or just the message. No `playlist_id` is sent, so every upload lands in the **default playlist** (jingles are not uploaded from mobile).
6. Always (finally): clears progress, deletes the staging directory, and reloads both lists.

API rules on that endpoint (`StoreTrackRequest`, `TrackController::store`, `TrackImporter::import`): `files` 1 to 30 items (the phone sends 1), each up to **300 MB** (`max:307200` KB), extensions `mp3,m4a,aac,flac,ogg,wav,mpga`; the route is throttled 20/min per user (`uploads`); **Pro gate** `assertAutoDjEnabled` -> 403 `autodj_not_available` ("AutoDJ is not included in your plan..."); storage cap checked under a row lock (message "Station storage limit reached (X used of Y)."); the request answers 201 on full success, 422 when none were added, 207 on partial. Title and artist come from ID3 tags, else from the filename. The phone treats 207 as success and reads `errors`. A 422 has two sources: request validation (size, type; carries Laravel's top-level `message`), and "nothing added" (the quota tripped on the first file), whose body is only `{data: [], errors: [...]}` with **no `message`**, so `apiUpload` throws "Upload failed (422)" and the quota text is lost. Uploads also queue an `AnalyzeTrack` job for loudness/cue points when `LIQUIDSOAP_ANALYSIS_ENABLED` is on (default); the phone never sees it. Details in [library-and-playlists.md](library-and-playlists.md).

**Delete flow** (select mode)

- **Long-press** a track to start selecting (rows become checkboxes and a "Done" pill replaces the Add button). Tap rows to toggle; unticking the last one ends select mode. Selection is by track id, **across playlists**.
- A bottom bar shows "Delete N track(s)" (disabled at 0), which opens a bottom sheet: "Delete N tracks? They're removed from your library and from every playlist they're in, and AutoDJ stops playing them. This can't be undone." with Delete / Keep them.
- `DELETE /stations/{slug}/tracks` with `{track_ids: [...]}` (`DestroyTracksRequest`: 1 to 2000 distinct ULIDs, all this station's). `TrackImporter::destroyMany` detaches the tracks from every playlist, deletes the rows, resequences, removes the files from disk, rewrites and reloads the playlist file (one reload for the whole batch) and records a `track_deleted` station event per file. The response is the fresh library (`meta.deleted`); the phone ignores it and reloads. Success notice "Deleted N track(s)."; failure notice with the error. Either way the lists reload.
- Deleting is **not plan-gated** (a downgraded owner can still delete), so Free can select and delete even though "+ Add" is hidden.
- Deleting a track that is playing does not interrupt what is on air until the next track boundary (audio path; see [autodj.md](autodj.md)).

**Web differences:** the web library also creates, renames, reorders and deletes playlists, drags tracks between them and reorders them, adds tracks to playlists, edits titles and artists (Fix tags), manages jingles, shows per-upload progress, and offers an upsell for Free (`client/app/dashboard/stations/[slug]/library/*`). The phone has none of that: read-only playlists plus upload-to-default and bulk delete.

## Endpoint summary

| Call | Where |
|---|---|
| `GET /stations` | `home.tsx` (first station) |
| `GET /stations/{slug}` | shell, Show times |
| `GET /stations/{slug}/status` | Overview |
| `GET /stations/{slug}/sessions` | Overview |
| `GET /public/stations/{slug}/listeners` | Overview (hero and stats) |
| `POST /stations/{slug}/start`, `POST /stations/{slug}/stop` | Overview |
| `GET /stations/{slug}/audience[?days=]` | Audience |
| `GET /stations/{slug}/playlists` | Schedule (Pro), Library |
| `PUT /stations/{slug}/autodj-slots` | Schedule |
| `PUT /stations/{slug}/schedules` | Show times |
| `GET /stations/{slug}/tracks`, `POST /stations/{slug}/tracks` | Library |
| `DELETE /stations/{slug}/tracks` | Library |
| `GET /playlists/{id}/tracks` | Library |

All are under the `verified` middleware group except the public listeners endpoint (`api/routes/api.php`). An unverified account gets 403 "Your email address is not verified." on all of them.

**Existing owner endpoints the phone never calls:** `POST /stations/{slug}/skip`, `stream-key` rotation, station PATCH/DELETE/creation, playlist CRUD, track PATCH/reorder, per-playlist track edits. The status payload's `up_next` and `playlist_length` are received and ignored.

## Surfaces

| Surface | What it does |
|---|---|
| Mobile (this doc) | The five screens above. |
| Web `/dashboard/stations/{slug}` (overview), `/audience`, `/library`, `/schedule`, `/settings` | The fuller version: see [station-management-dashboard.md](station-management-dashboard.md), [schedule.md](schedule.md), [library-and-playlists.md](library-and-playlists.md), [listener-analytics.md](listener-analytics.md). |
| Studio and encoder | [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md). |

## Gaps and traps

1. **The Jingles card in Library is dead.** `library.tsx` builds it from `tracks.filter(kind==='jingle')`, but `GET /stations/{slug}/tracks` defaults to `kind=music` (`TrackController::index`), so the array is always empty. Jingles are unreachable on mobile, even though the storage meter (which does count jingle bytes) can be "full" with nothing visible to delete.
2. **Slot saves fail silently-ish on a station with no timezone.** A Pro owner with no timezone sees no hint on the Schedule tab (the footer only shows when there is a zone), taps + Add, and the save returns 422 "Set the station timezone before adding slots." The way out is to add a Show time first (which stamps the phone's zone) or use the web settings. The web disables Save with an explanation; the phone does not.
3. **The first Show times save silently sets the station timezone to the phone's.** It then re-times both show times and every AutoDJ slot. There is no confirmation and no mobile picker.
4. **Show times screen and the shell disagree after a save.** The screen owns a separate `GET /stations/{slug}` copy. The Overview's "N on your player page" and the Schedule tab's coral rows are refreshed only by their own reloads (Schedule reloads on focus; Overview does not).
5. **"Request Pro" is not a request.** It only opens the web `/dashboard` in an in-app browser. Free owners get no direct upgrade path in the app, and the copy elsewhere ("comes with Pro") sends them nowhere.
6. **"NOW" and "today" use the phone's clock and date**, while slots live in the station's timezone. Away from the station's zone the badge and the selected weekday can be wrong. NOW also depends on an intent-derived `is_on_air`, not container health.
7. **Multi-day slots edit all their days at once** (no per-day edit as on the web grid).
8. **One station only.** `home.tsx` takes `data[0]`; a second station is invisible on mobile.
9. **Overview polls the listeners endpoint twice** while running (Hero and Stats), and `Hero`/`Stats` differ on whether `reconnecting` counts as "live here".
10. **AIRTIME and SHOWS are live-broadcast-only** (closed stream sessions), but sit next to a LISTENING/peak that includes AutoDJ audiences. A brand-new AutoDJ-only station shows 0 shows and 0m while having a peak.
11. **A first-file quota failure reads "Upload failed (422)".** `TrackController::store` answers 422 with `{data: [], errors: [...]}` and no `message`; `apiUpload` only reads `message`, and reads `errors[]` only on 2xx/207. The "Station storage limit reached" text is shown only when an earlier file in the batch succeeded (207).
12. **Stream key exposure by payload.** `GET /stations/{slug}` is the `withEncoder()` variant, so the mobile app receives the encoder host/port/password on every station fetch when the owner's plan has `encoder_enabled` and `LIQUIDSOAP_ENCODER_HOST` is configured, although no screen shows it. `Station` in `lib/station.ts` does not declare the field.
13. **Overview stop button is hidden during a browser broadcast, and while the container is down.** An owner whose browser studio tab is live (or was lost) cannot turn the station off from the phone's Overview: only encoder broadcasts get the force option (`station_is_live_external`), and the API refuses a browser one with 409 `station_is_live`. The phone offers no way to end another device's browser broadcast.
14. **Hand-copied API types.** `lib/station.ts` mirrors the resources by hand; a resource change will not fail a build.
15. **Dead helpers:** `formatAgo`, `formatWhen`, `formatDays` and `DAY_SHORT` in `lib/station.ts` are referenced nowhere in `mobile/src`. `addHours` has one fallback use (an empty `end_time`, which the API never returns).
16. **Sessions and status errors are mostly invisible on Overview.** If `GET /sessions` fails, Recent shows stays on its skeleton forever (`data` stays `null`, the error is never rendered). A failing status poll only changes the hero label to STATUS UNKNOWN.
17. **No automated tests for any mobile screen.** No `*.test.*` or `*.spec.*` file exists under `mobile/` outside `node_modules`.

## Tests

- Mobile: none.
- API endpoints this screen depends on: `api/tests/Feature/AutodjSlotTest.php`, `api/tests/Feature/AudienceControllerTest.php`, `api/tests/Feature/TrackControllerTest.php`, `api/tests/Feature/StationScheduleTest.php`, `api/tests/Feature/StationPowerControllerTest.php`, `api/tests/Feature/StationStatusTest.php`, `api/tests/Feature/StationStatsTest.php`. Not run as part of this write-up.

## History

- 2026-09-28: app re-skinned to the "GoCast Studio" comp: single-station home, Library upload/delete, Schedule editing (`mobile-studio-redesign` handoff, `docs/MOBILE-APP-HANDOFF.md`).
- 2026-09-29: show times moved out of the Schedule tab into their own screen reached from the Overview link card; the "Live show | AutoDJ" picker removed ([schedule.md](schedule.md)).
