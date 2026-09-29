---
feature: Station management dashboard (shell, overview, station CRUD, settings)
verified: 2026-09-29 against ea570df plus uncommitted work
sources:
  - client/app/dashboard/layout.tsx
  - client/app/dashboard/page.tsx
  - client/app/dashboard/error.tsx
  - client/app/dashboard/library/page.tsx
  - client/app/dashboard/stations/page.tsx
  - client/app/dashboard/station/[[...path]]/page.tsx
  - client/app/dashboard/stations/[slug]/(overview)/page.tsx
  - client/app/dashboard/stations/[slug]/settings/page.tsx
  - client/app/dashboard/stations/[slug]/settings/ShowTimesSection.tsx
  - client/app/dashboard/stations/[slug]/settings/EncoderSection.tsx
  - client/app/dashboard/stations/[slug]/settings/EncoderCard.tsx
  - client/app/dashboard/stations/[slug]/settings/ShowTimesEditor.tsx
  - client/app/dashboard/stations/[slug]/settings/loading.tsx
  - client/app/dashboard/stations/[slug]/(overview)/loading.tsx
  - client/app/dashboard/broadcasts/page.tsx
  - client/app/dashboard/stations/[slug]/DeleteStation.tsx
  - client/app/dashboard/stations/[slug]/StationActions.tsx
  - client/app/dashboard/stations/[slug]/LinksEditor.tsx
  - client/app/dashboard/stations/[slug]/TimezoneCombobox.tsx
  - client/app/dashboard/settings/layout.tsx
  - client/app/dashboard/settings/page.tsx
  - client/components/dashboard/AppSidebar.tsx
  - client/components/dashboard/DashboardHeader.tsx
  - client/components/dashboard/CreateStationButton.tsx
  - client/components/dashboard/StationFormDialog.tsx
  - client/components/dashboard/StationChecklist.tsx
  - client/components/dashboard/StationActivity.tsx
  - client/components/dashboard/StationPower.tsx
  - client/components/dashboard/StationShare.tsx
  - client/components/dashboard/AutoDjRotation.tsx
  - client/components/dashboard/RecentBroadcasts.tsx
  - client/components/dashboard/ShowSignOff.tsx
  - client/components/dashboard/HelpLink.tsx
  - client/components/dashboard/CopyButton.tsx
  - client/components/dashboard/LiveListeners.tsx
  - client/components/dashboard/TrackProgress.tsx
  - client/components/dashboard/EncoderConnection.tsx
  - client/components/dashboard/EmbedDialog.tsx
  - client/components/dashboard/GoLiveTrigger.tsx
  - client/components/dashboard/NotificationBell.tsx
  - client/components/dashboard/LiveBanner.tsx
  - client/contexts/StationContext.tsx
  - client/contexts/AccountContext.tsx
  - client/contexts/ProRequestContext.tsx
  - client/hooks/useStationStatus.ts
  - client/hooks/useListenerCount.ts
  - client/hooks/usePublicStationStats.ts
  - client/hooks/useNotifications.ts
  - client/actions/auth.ts
  - client/lib/env.ts
  - client/next.config.ts
  - client/lib/station-server.ts
  - client/lib/api-server.ts
  - client/lib/axios.ts
  - client/lib/socialLinks.ts
  - client/interfaces/Station.ts
  - client/interfaces/StationStatus.ts
  - client/interfaces/StreamSession.ts
  - client/interfaces/Plan.ts
  - client/interfaces/User.ts
  - client/interfaces/Playlist.ts
  - client/interfaces/Track.ts
  - api/app/Http/Controllers/StationController.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Http/Controllers/UploadController.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Http/Requests/StoreStationRequest.php
  - api/app/Http/Requests/UpdateStationRequest.php
  - api/app/Http/Requests/UploadRequest.php
  - api/app/Policies/StationPolicy.php
  - api/app/Http/Middleware/EnsureEmailIsVerified.php
  - api/app/Http/Controllers/StreamKeyController.php
  - api/app/Providers/AppServiceProvider.php
  - api/database/migrations/2026_04_03_193133_create_stations_table.php
  - api/database/migrations/2026_04_16_131050_create_plans_table.php
  - api/database/migrations/2026_09_02_100000_raise_plan_listener_caps.php
  - api/app/Models/Station.php
  - api/app/Models/Plan.php
  - api/app/Observers/StationObserver.php
  - api/app/Observers/UserObserver.php
  - api/app/Console/Commands/PruneDeletedStations.php
  - api/routes/api.php
  - api/routes/console.php
  - api/config/liquidsoap.php
fingerprint: 3915f007cb1d2832
---

# Station management dashboard

The signed-in web shell for one broadcaster: the sidebar and header, the station Overview, station create/edit/delete, and the Station settings and Account pages. **A user has one station.** The client enforces that by always resolving "the" station as the oldest one the account owns (`client/lib/station-server.ts` `getMyStation`). The API does **not** enforce it: the plan row still allows one station on Free and five on Pro (`plans.max_stations`, created in `2026_04_16_131050_create_plans_table.php`, never lowered by a later migration). The UI hides that, so a second station made by API is invisible in the dashboard.

Other things that surprise people:

- **Editing the station profile on a running station restarts its Liquidsoap container.** `name`, `slug`, `description`, `genre` and `artwork_url` are in `StationObserver::LIQ_RELEVANT_COLUMNS`, so a changed value re-renders the `.liq` and calls `supervisor->up()`, which "always re-renders the .liq and restarts the container ... a restart drops connected listeners" (`LiquidsoapSupervisor::up` docblock). Show times, timezone, social links, `theme_config` are not in that list and never restart anything.
- **"Delete station" is a soft delete.** The container comes down at once; the row, audio and history stay for 30 days and are then erased by `stations:prune-deleted`. The dialog says "This can't be undone", and in the product that is true (no restore UI or endpoint exists), but the data is not gone for a month.
- **The station has two "states" on the same screen** with different sources of truth: the server-rendered Overview page carries the cheap intent-derived `state`, while `StationPower` polls `/stations/{slug}/status` and paints the real one. See Overview below.

Everything about going on and off air, the studio, the library, the schedule and the audience is owned elsewhere: [Station lifecycle](station-lifecycle.md), [Web studio](broadcasting-web-studio.md), [Library and playlists](library-and-playlists.md), [AutoDJ](autodj.md), [Schedule](schedule.md), [Listener analytics](listener-analytics.md), [Encoder ingest](encoder-ingest.md), [Public player and embed](public-player-and-embed.md), [Accounts, plans, invites](accounts-plans-invites.md), [Auth](auth.md). This doc covers their entry points into the shell and what the shell itself does.

## Route map

All under `client/app/dashboard/`. Every route is inside `layout.tsx` and `error.tsx`.

| URL | File | What it is |
|---|---|---|
| `/dashboard` | `page.tsx` | Resolves the station. Has one: `redirect` to `/dashboard/stations/{slug}`. Has none: the onboarding page ("Create your station" + `CreateStationButton`). A failed `/stations` fetch throws to `error.tsx`. |
| `/dashboard/stations` | `stations/page.tsx` | Dead URL kept for old bookmarks. Always `redirect("/dashboard")`. |
| `/dashboard/library` | `library/page.tsx` | Forwarder. Station: redirect to `.../library`; none: `/dashboard`. Exists only because the sidebar's slugless AutoDJ fallback points here. |
| `/dashboard/station/{...path}` | `station/[[...path]]/page.tsx` | Slug-free deep link (singular "station"). Looks up the viewer's own station and redirects. Allowlist `STATION_PAGES = studio, live, library, audience, settings`; anything else (including `schedule`, multi-segment paths and typos) lands on the station Overview. No station: `/dashboard`. Built for announcement buttons (one payload for every account). |
| `/dashboard/stations/{slug}` | `stations/[slug]/(overview)/page.tsx` | The Overview (below). |
| `/dashboard/stations/{slug}/settings` | `.../settings/page.tsx` | Station settings (below). Anchors `#links`, `#show-times`, `#encoder` are deep-linked from the checklist and elsewhere. |
| `/dashboard/stations/{slug}/live`, `/studio` | own docs | Pre-flight and studio. The sidebar's Studio item and `StationActions` link here. |
| `.../library`, `.../schedule`, `.../audience` | own docs | Library, Schedule, Audience. |
| `/dashboard/broadcasts` | `broadcasts/page.tsx` | Session history for the resolved station: one API page (`/stations/{slug}/sessions`, newest 20), finished sessions only, columns Started / Source / On air (bar capped at 3 h) / Peak. **Any** failure (including a 5xx or timeout) becomes `notFound()`, unlike the per-station pages. Empty: "Nothing on the log yet" plus `StationActions mode="live"` (Go live / Open studio), or "Create your station" with no station. Header says "Your latest N shows" when the page is truncated. |
| `/dashboard/settings` | `settings/page.tsx` | **Account** page (not station settings). Tab title "Account" via `settings/layout.tsx`. |

Per-station pages call `apiFetch('/stations/{slug}')` themselves and treat **403 and 404 the same**: `notFound()`. Rationale in code: a 403 from `StationPolicy::view` should not confirm that someone else's slug exists. Any other failure (timeout after 10 s, 401, 5xx) is logged and rethrown to `error.tsx` (`client/lib/api-server.ts`: `TIMEOUT_MS = 10_000`, `no-store`, bearer token from the `token` cookie; it does **not** redirect on 401). The browser-side axios instance (`client/lib/axios.ts`) does: any 401 outside `/login`/`/register` runs `clearAuth()` and sets `window.location` to `/auth/login?expired=1` once; a 403 with `code: "email_unverified"` toasts "Verify your email to continue.".

## The shell (`layout.tsx`)

A server component. In order:

1. Reads cookies `token` and `user`. Missing either: `redirect("/auth/login")`. `JSON.parse(decodeURIComponent(userCookie))` is unguarded, so a corrupt `user` cookie throws to the error boundary rather than redirecting.
2. `user.email_verified_at` falsy (from the cookie): `redirect("/auth/login")`. The login page reopens the verify modal from the dangling cookie.
3. Two parallel fetches, each with its own failure fallback (logged, never fatal):
   - `GET /user` into `Account { email, plan }`. On failure `plan` is `null`, and every plan hook then answers "unlocked/unknown", never "Free".
   - `getMyStation()` (React `cache()`d, one `/stations` request per render) into `CurrentStation { slug, name, artwork_url, genre, description }`. On failure `null`.
4. Renders providers outermost to innermost: `RealtimeProvider(userId)` > `BroadcastProvider` > `AccountProvider` > `ProRequestProvider` > `StationProvider` > `SidebarProvider`, then `AppSidebar`, `SidebarInset` containing `DashboardHeader`, `LiveBanner`, `<main className="flex-1 p-6">`, and `BroadcastMiniController`.
5. Metadata: title default "Dashboard", template `%s — GoCast`, `robots: noindex, nofollow`.

The broadcast (mic, mixer, encoder) lives in `BroadcastProvider`, above every page in the shell, so navigating between dashboard pages does not end a show. Anything that does a full page load (`<a href>`, `window.location`) does. That is why `StationActions`, `LiveBanner`, `error.tsx` and the sidebar use `Link` for studio links and `HelpLink` always opens a new tab.

### Contexts

| Context | Holds | Notes |
|---|---|---|
| `StationContext` (`useCurrentStation`, `useStationBySlug`) | Identity only: slug, name, artwork, genre, description | Set once per layout render. `useStationBySlug(slug)` returns null when the route slug differs from the resolved station, so the header never shows the wrong name. Goes stale after an edit until something re-renders the layout (`router.refresh()` does). |
| `AccountContext` (`useAccount`, `usePlan`) | `{ email, plan }` | Not refreshed mid-session except by a layout re-render. |
| Lock hooks | `useAutoDjLocked` = plan known and `!autodj_enabled`; `useAudienceLocked` = plan known and `analytics_days <= 0`; `useEmbedLocked` = `!embed_enabled`; `useEncoderLocked` = `!encoder_enabled` | All return `false` when the plan is `null`. UI gates only; the API enforces. |
| `ProRequestContext` (`useProRequest`) | `open()` and `requested` | Owns one `ProAccessDialog` (`plan="pro"`, prefilled with the account email). `requested` flips true after a submit and is per page-load state, not persisted. Every "Request Pro" button in the shell reads it. Pro is granted by hand: `PRO_AVAILABLE = false` in `client/interfaces/Plan.ts`, `PRO_PRICE_USD = 15`. |

### Sidebar (`AppSidebar.tsx`)

Items, in order (`NAV_ITEMS`). Each has a slugless fallback `href` and, once the layout resolved a station, a direct `stationHref`.

| Item | With station | Fallback | Active when | Lock badge |
|---|---|---|---|---|
| Overview | `/dashboard/stations/{slug}` | `/dashboard` | path is `/dashboard`, or any `/dashboard/stations/{x}...` **except** `library|schedule|audience|settings|live|studio` | none |
| Studio | `.../live` (or `.../studio` of the **broadcasting** station while this tab is broadcasting, with a pulsing "Live" tag) | `/dashboard` | `.../live` or `.../studio` | none |
| AutoDJ | `.../library` | `/dashboard/library` | `/dashboard/library` or `.../library` | "Pro" when `useAutoDjLocked` |
| Schedule | `.../schedule` | `/dashboard` | `.../schedule` | "Pro" when AutoDJ-locked |
| Audience | `.../audience` | `/dashboard` | `.../audience` | "Pro" when `useAudienceLocked` |
| Broadcasts | `/dashboard/broadcasts` | same | path starts with it | none |
| Settings (station) | `.../settings` | `/dashboard` | `.../settings` | none |

Locked items stay clickable on purpose; the destination explains the feature. The Overview matcher is a hand-maintained list: adding a new station sub-page requires adding it to the subtraction regex, or Overview stays lit on it.

Footer:
- **Plan card**, only when `useAutoDjLocked` (in practice: Free, plan known). Shows "{plan name} plan", a small button reading "Request" plus an amber Pro badge (`proRequest.open`; becomes "Requested", with the line "Request sent - we'll be in touch.", once requested), and "Your station goes silent when you stop broadcasting."
- **Account menu** (avatar, name, email). A plan badge with the plan name appears next to the name when a plan is known **and** AutoDJ is not locked (so any AutoDJ-enabled plan shows its name). Menu: Account (`/dashboard/settings`), Help (`/help`, new tab), Sign out. Signing out while `isBroadcasting` (from `useSignOut`) first asks "Sign out and end your broadcast?" (Stay signed in / End and sign out, which calls `signOut("/", { confirmed: true })`).
- Logo links to `/dashboard`.

### Header (`DashboardHeader.tsx`)

`SidebarTrigger`, a breadcrumb from the URL, and `NotificationBell` on the right (a popover; `useNotifications` polls `/notifications/unread-count` every 60 s, see [Notifications](notifications-and-email.md)). Breadcrumb rules: the `stations` segment is skipped; the slug segment shows the station name from `StationContext` (falls back to the raw slug); labels come from `SEGMENT_LABELS` (`broadcasts` Broadcasts, `settings` Settings, `library` **AutoDJ**, `schedule`, `audience`, `live` **Go live**, `studio`); unknown segments are capitalised. `/dashboard/settings` is labelled **Account**. On `/dashboard` itself there are no crumbs.

### Live banner (`LiveBanner.tsx`)

Rendered under the header on every page except the studio, only while this tab is broadcasting (`state` `live` or `reconnecting`). Shows the studio's signal lamp (`useStudioSignal`/`useTransportHealth`, `SIGNAL_TONE`), copy that differs on touch devices ("switching apps or locking the screen stops the show" vs "closing it ends the show"), an "Mic off" button when the mic is latched (`engine.setMicLatched(false)`), and "Open studio". Detail belongs to [Web studio](broadcasting-web-studio.md).

### Error boundary (`error.tsx`)

Sits inside the layout so the broadcast survives a page crash. Heading "This page didn't load". While live it says "Your broadcast is still on air. Only this page failed ..." and offers "Back to the studio" (to the **broadcasting** station's studio, not the current one); otherwise "Go to your station" (`/dashboard`). "Try again" calls `unstable_retry` (Next 16; re-fetches, unlike `reset`). A "Details for support" disclosure shows `error.message` and `digest`.

## Overview (`stations/[slug]/(overview)/page.tsx`)

Server component. Fetches in parallel: `/stations/{slug}`, `/stations/{slug}/sessions`, `/stations/{slug}/playlists` (failure here is swallowed to `null`). Then, depending on the programme, a second fetch `/playlists/{activeId}/tracks` (failure swallowed, sets `tracksUnavailable`). `activeId` = `station.programme.playlist.id` (the playlist AutoDJ resolves right now) falling back to the default playlist. If the playlists fetch failed, `tracks` is empty and `tracksUnavailable` is true; if there is no active playlist at all, `tracks` is empty and `tracksUnavailable` is false. The station fetch is `show()`, so the payload carries `encoder`, `schedules`, `programme` and `stats`; the sessions and station fetches are the only two whose failure is fatal (404/403 become `notFound()`).

Sections, top to bottom:

1. **`ShowSignOff`**: a dismissible "That's a wrap." card. Reads a `ShowSummary` from `sessionStorage[signOffKey(slug)]` (written by the studio when a show ends), deletes it on read, and shows it only if `endedAt` is under 30 minutes old (`FRESH_MS`). Facts: On air, Peak listeners, Audio lost. Sentence depends on `summary.after`: `autodj`, `silence`, else "off air until your next show". Per-tab, one-shot.
2. **Header**: artwork (`StationArtwork`, gradient + music icon when none), name, genre badge, description (2 lines), meta line, and actions: "Player page" (`/station/{slug}`, new tab), `StationActions mode="edit"` ("Edit station profile"), a gear link to settings. Meta line parts: `Created {date}`; the literal `STREAM_FORMAT = "Streams in MP3, 128 kbps"`; `Last live {relative}` only when `station.state === "offline"` and a closed session exists in the loaded page. The format string is hardcoded in the page, matching `%mp3(bitrate=128, samplerate=44100)` in `station.blade.php`; it is not read from the API.
3. **On air now**: `StationPower` with `LiveListeners` as its `aside`, then `AutoDjRotation`.
4. **Your shows**: `StationActivity` and `RecentBroadcasts`.
5. **Share**: `StationShare` and `StationChecklist`.

`loading.tsx` renders a skeleton of the same layout, animation disabled under `prefers-reduced-motion`.

### `StationPower`: the on/off card

One `useStationStatus(slug)` poll feeds two half-cards (power, and now playing, only while running) plus the aside. Full lifecycle semantics are in [Station lifecycle](station-lifecycle.md); what the card does:

**Polling** (`client/hooks/useStationStatus.ts`): `GET /stations/{slug}/status`. Intervals: 2 s when starting, unknown, or when the live arm and `broadcaster` disagree; 30 s when `offline`; otherwise 10 s (30 s when the realtime socket is connected, `POLL_PUSHED_MS`), shortened to the end of the current track (`remaining*1000 + 750 ms`, floor 3 s). Skips the read while the tab is hidden; a `visibilitychange` restarts it. A realtime station signal for this slug restarts it after 120 ms. Failures back off `2 s * 2^(n-1)` up to 30 s, and the last good status is kept.

**Headline pill** (`Headline` type), first match wins:

| Pill | When |
|---|---|
| Not reaching listeners (red) | `state === "degraded"` |
| Starting... | `state === "starting"` |
| Live (emerald) | `broadcasterAttached` |
| Off air | `state === "offline"` (state = polled status, else the page payload's) |
| Checking... | running, no status yet, under 10 s |
| Status unknown | no status after failure or 10 s, or `!status.reachable` |
| No sound | `source === "silence"` |
| On air (violet) | otherwise |

`broadcasterAttached` = running and (this tab is broadcasting, **or** the status is reachable and `broadcaster` (falling back to `live_source !== null` for old containers)). It deliberately ignores `state`/`source`, which lag by the live arm's buffer.

**Controls**:
- Off air, plan has AutoDJ: primary **Start AutoDJ** (`POST /stations/{slug}/start`, toast "Station is coming on air") and secondary **Go live** (`GoLiveTrigger`).
- Off air, AutoDJ locked (Free): only **Go live**. Rationale in code: without AutoDJ an empty station emits silence and `stations:sweep` turns it off within minutes, so "Start AutoDJ" would be a dead end.
- Running, nobody on air: **Go live** (disabled until the first poll answers) and **Turn station off** (`POST .../stop`). Turning off while on AutoDJ (`headline === "on_air" && isAutoDj`) asks "Turn {name} off?" first (Keep playing / Turn station off).
- Live from this tab: **Open studio**. Live from an encoder or another browser: **Hear your stream** (opens the player page). Live from another browser: the stop button is hidden (`liveElsewhere`, browser/electron `live_source` only); from an encoder it is **kept**, so the owner can cut off a leaked key.
- A stop refused with `code: "station_is_live_external"` opens "Cut off this broadcast?" and, on "Cut it off", re-sends stop with `{ force: true }`. Other API errors show the server's `message` as a toast.
- `compact` mode (badge + one button) exists as a prop; nothing in scope uses it.

**Second half** ("Now playing", only while running): source chip (Live from this browser / Live from {client} / Live from an encoder / Live from another browser / Live / Handing back to AutoDJ / AutoDJ / Silence), a line derived from `now_playing` with special text during handover ("Going live in a few seconds...", "Taking over from AutoDJ...", "Handing back to AutoDJ soon...") and empty-rotation cases, a `TrackProgress` bar for AutoDJ only, and "Up next: ..." from `status.up_next[0]`. The last non-null `now_playing` is held in a ref across the null gap between tracks, cleared when the station stops or a broadcaster arrives or leaves. A `HelpLink` to `/help/turning-your-station-on-and-off` sits by the pill. The power half also carries a one-line plain-language `powerDetail` per headline (for example "Nothing is playing. Nobody can tune in right now") and a `powerHint` (for example "Go live and AutoDJ pauses until you finish.", or, with an encoder on air, "Stop broadcasting in {client} to end the show."); the pill text is duplicated in a screen-reader-only live region (role `alert` only for the fault). The card's edge tints with the headline (fault red, live emerald, on-air violet).

### `StationActivity`

"Broadcast activity", last 14 days (`DAYS = 14`). Built client-side from the `sessions` prop, closed sessions only, bucketed by local start day (a show over midnight counts wholly on its start day). Four numbers: Live airtime (window sum, with delta against the prior 14 days), Broadcasts (count and average length), Peak listeners (`stats.peak_listeners`, "most at the same moment, ever"; hints "not measured yet, see Audience" or "nobody has tuned in yet"), Total airtime (`stats.total_airtime_seconds` and `stats.sessions`, all time). Then a 14-bar chart (minimum bar 4 px, tooltip per day) and a caption that AutoDJ time is not a session and is not counted.

### `AutoDjRotation`, `RecentBroadcasts`, `StationShare`

- `AutoDjRotation`: shows the **active playlist's** first 4 tracks (`PREVIEW_COUNT`) with "{n} more". Subtitle variants: couldn't load; Free ("Your station goes silent when you close the studio..."); empty playlist; programme detail; default. Button "See what AutoDJ does" (Free) / "Add tracks" (empty) / "Manage music", all to `.../library`. Pro badge when locked.
- `RecentBroadcasts`: first 5 sessions (`LIMIT`) of the 20 fetched, columns Started / Source (Studio, Desktop, Encoder; the software name is the tooltip) / Duration ("Now" while open) / Peak. Empty: "No broadcasts yet. Go live to see your session history here." "View all" goes to `/dashboard/broadcasts`.
- `StationShare`: the player URL (`env.appUrl + /station/{slug}`) with `CopyButton` (label "Share": `shareOrCopy`, "Done!" for 2 s), "Tune-in code" (QR dialog: 640 px canvas shown at 224 px, level H, margin 4 modules, violet `#4c1d95` modules on white, logo excavated at 22%, "Download PNG" as `{slug}-qr.png`), and "Embed" (opens `EmbedDialog`, or the Pro request when `useEmbedLocked`, with a Pro badge). `EmbedDialog` shows a live iframe preview of `/embed/{slug}`, the paste snippet and a Copy code button. Embed itself: [Public player and embed](public-player-and-embed.md).
- `LiveListeners` (the strip's aside, `bare` mode): a "Listening now" number that tweens up over 650 ms, fed by `useListenerCount`, which reads the **public** `GET /public/stations/{slug}/listeners` through a shared per-slug feed polled every 10 s (`usePublicStationStats`), not the owner status endpoint. `isOnAir` is the intent-derived `station.state !== "offline"`, so off air it shows a dash and "Go live or start AutoDJ to start counting."; an unanswered poll shows a dash, never 0. It links to `.../audience`. Count semantics are in [Listener analytics](listener-analytics.md).
- `TrackProgress`: a rAF-driven bar under the AutoDJ track (elapsed / remaining from `status.elapsed`/`remaining`); renders nothing without a track length.
- `GoLiveTrigger`: wraps the Go live buttons. Clicking opens "How do you want to broadcast?": "Go live from this browser" (`router.push(.../live)`) or, when the plan has the encoder or shows it locked (`station.encoder !== undefined || encoderLocked`), "From a broadcast app" (Pro badge when locked), which shows the encoder values and polls status every 2 s (`WATCH_POLL_MS`) while it waits for the encoder. Studio and encoder detail: [Web studio](broadcasting-web-studio.md), [Encoder ingest](encoder-ingest.md).

### `StationChecklist` ("Finish setting up")

Six items, ordered: artwork, description, tracks, show times, links, first listener. Only unfinished items are drawn, with `{done}/{total} done` in the header once at least one is done; the card returns `null` when all are done.

| Item | Done when | Action |
|---|---|---|
| Add station artwork | `artwork_url` set | opens `StationFormDialog` (its own instance, separate state from the header's) |
| Write a description | `description` set | opens the same dialog |
| Fill the default playlist | `trackCount > 0` | link to `.../library`. **Omitted entirely on Free** (`useAutoDjLocked`), so the total is 5 there |
| Set your show times | `schedules.length > 0` | link `.../settings#show-times` |
| Add your social links | `social_links.length > 0` | link `.../settings#links` |
| Get your first listener | `stats.has_listeners`, else `peak_listeners > 0` | none |

`trackCount` is the length of the **active programme playlist's** tracks (what the Overview fetched), not strictly the default playlist despite the title. With a slot running a different playlist the item follows that one; if the tracks fetch fails it counts as 0 and the item reappears.

## Creating, editing and deleting a station

### Create

Only surface: `/dashboard` when the account has no station (`CreateStationButton` opens `StationFormDialog` with no `station`). Sidebar links go to onboarding while none exists.

`POST /stations` (`StationController::store`, route inside the `verified` group):
1. `StoreStationRequest::authorize()`: `user->stations()->count() < user->plan->max_stations` (counts non-deleted stations only, so deleting frees a slot). Failure is a 403 with no station-specific message. A user whose `plan` relation were null would 500 here (`plan_id` defaults to 1 with an FK, so not reachable in normal data).
2. Rules: `name` required string max 100; `description` nullable string (no max); `genre` nullable string max 255; `artwork_url` nullable string `url:http,https` max 2048.
3. `$user->stations()->create($validated)`, refreshed, returned as 201 with `StationResource`.

What the `creating`/`created` hooks in `Station::booted` and `StationObserver::creating` do:
- `slug` = `Str::slug(name)` (empty result, e.g. emoji-only, becomes `station`), truncated to 55 chars, then `-2`, `-3`, ... until free. The uniqueness check uses `withTrashed()`, so a deleted station's slug is not reused until the row is force-deleted. Column is `varchar(60)` unique. **The slug is immutable**: it is not in `UpdateStationRequest`, and no hook regenerates it. Renaming changes the name only; the URL stays.
- `icecast_mount` = `/stream/{slug}`; `icecast_password` = `Str::random(32)`; `stream_key` = 32 chars `[A-Za-z0-9]` (`generateStreamKey`, stored with the `encrypted` cast); `desired_state` = `stopped`; jingle defaults (`jingles_enabled` false, `jingle_mode` interval, 1800 s, every 5 tracks).
- `container_index` = `max(container_index, including trashed) + 1`, never recycled (unique).
- After create, a default playlist is created (`Playlist::DEFAULT_NAME`, `is_default`, sequential, position 0).
- **Nothing starts.** A new station has no container and is `state: "offline"` until the owner presses Start AutoDJ or Go live.

Client (`StationFormDialog`): success shows "Station created - ready to go live?" and `router.push` to the new slug. See form details below.

### Edit

`PUT /stations/{slug}` (`update`): `authorize('update')` (owner only, 403 otherwise), then `station->update($validated)`. `UpdateStationRequest::authorize()` returns `true`; ownership is the controller's job. The request rules are the full settings-form contract; the table below lists every field this endpoint accepts, including ones no dashboard form sends.

| Field | Rule | Sent by | Notes |
|---|---|---|---|
| `name` | `sometimes`, string, max 100 | Edit profile dialog | `sometimes` plus not nullable: an explicit null is a 422. Restarts a running container. |
| `description` | nullable string | Edit profile dialog | No length cap; the column is `text`. Restarts a running container. |
| `genre` | nullable string, max 255 | Edit profile dialog | Restarts a running container. |
| `artwork_url` | nullable string, `url:http,https`, max 2048 | Edit profile dialog (after an upload) | Any http(s) URL is accepted, not only ones we uploaded. Restarts a running container. |
| `timezone` | nullable, `timezone:all` | Nothing in the web or mobile apps (both send the zone in `PUT /stations/{slug}/schedules`, [Schedule](schedule.md)) | IANA name only. Clearing to null is a 422 while any show time (`schedules()`) or AutoDJ slot (`autodjSlots()`) exists (`withValidator` after-hook, two separate messages). Column `varchar(64)`. |
| `social_links` | nullable array, max 8 (`Station::MAX_SOCIAL_LINKS`); each element `array:label,url` (extra keys rejected); `url` required string `url:http,https` max 2048; `label` nullable string max 30 | `LinksEditor` | Full-list replace; stored as JSON. |
| `theme_config` | nullable array | nothing | **Dead.** Validated, stored and returned, read by no client code. |
| `jingles_enabled` | `sometimes` boolean | Library jingles dialog | Turning it **on** requires AutoDJ (`StationLifecycleService::assertAutoDjEnabled`); turning it off is always allowed. |
| `jingle_mode` | `sometimes`, in `interval`, `tracks` | Library jingles dialog | |
| `jingle_interval_seconds` | `sometimes` integer 60..14400 | Library jingles dialog | |
| `jingle_every_tracks` | `sometimes` integer 1..100 | Library jingles dialog | |

`slug` in a payload is ignored. Admin-owned columns (`featured`, `featured_at`, `stream_key`, `desired_state`...) are not in the rules, so `validated()` never carries them. The model uses `$guarded = []`, so anything that bypasses the FormRequest (admin code, factories, tinker) can write any column.

Observer effects on update (`StationObserver::updated`): jingle columns changed on a running station are pushed over telnet (`applyJingleSettings`), no restart. If any of `name, slug, description, genre, icecast_mount, icecast_password, artwork_url` changed and the station is running, `supervisor->up()` restarts it (`safely()`: a Docker failure is logged, not thrown, and `stations:reconcile` later converges). A stopped station just picks the change up at next start. Slug-change branches (stop old container, rename the playlist directory) exist but are unreachable through the API today because the slug is immutable.

Audit: `LogsActivity` on `Station` logs only `name, slug, description, genre, featured, desired_state`, dirty only. Artwork, timezone and social links are not in the activity log.

### The create/edit form (`StationFormDialog`)

One component, two modes (`station` prop present = edit). Title "Create station"/"Edit station", description "Set up your new station."/"Update your station details."

| Field | Control | Client constraint | Server constraint | Error display |
|---|---|---|---|---|
| Artwork | Square tile button + hidden file input, `accept="image/png,image/jpeg,image/webp"` | Hint text says "Square image, max 2 MB" (**not enforced**) | Upload endpoint: jpg, jpeg, png, webp, gif, **max 5120 KB** (`UploadRequest`); rate limit `throttle:uploads` 20/min per user | Upload failure: toast "Failed to upload artwork", preview cleared. No inline error for `artwork_url`. |
| Name | Text input, `required`, `maxLength=100`, placeholder "My Radio Station" | as left | required, max 100 | Inline `FieldError` (only field with one) |
| Station URL | Edit mode only, read-only text `gocast.fm/station/{slug}` | none | slug immutable | none. The host is hardcoded, not read from `NEXT_PUBLIC_APP_URL`. |
| Genre | Text input, `maxLength=255`, placeholder "Jazz, lo-fi, talk" | 255 | max 255 | **None**: `errors.genre` is stored but never rendered |
| Description | Textarea, 3 rows, placeholder "What's your station about?" | none | none | none |

Artwork flow: choosing a file sets a local `URL.createObjectURL` preview and `POST /upload/images` (multipart, `file`); the response `data.url` (`asset("storage/{path}")`, disk `public`, folder `uploads/images`) becomes `artwork_url`. "Remove" clears both (sends `artwork_url: null`). The submit button is disabled while uploading or saving.

Submit payload: `{ name, description: description || null, genre: genre || null, artwork_url: artworkUrl || null }`. Edit sends `PUT`, success toast "Station updated", `onClose`, `router.refresh()`. Error handling: any 403 (both modes) toasts "Each account has one station, and yours already exists."; a response with `errors` fills the per-field map; otherwise the server `message` or "Something went wrong".

Form state is initialised once from props (`useState(station?.name ...)`). The component stays mounted, so **Cancel or close keeps unsaved typing** and reopening shows it; a second dialog instance (`StationChecklist`) has its own separate state. Neither re-syncs if the station changes elsewhere.

### Delete

Settings page, danger zone (`DeleteStation`): "Delete station" (outline) opens a dialog "Delete {name}?" ("It goes off air straight away, and its player page, stream links and embeds stop working. You lose its library, schedule and broadcast history with it. This can't be undone."). Buttons "Keep station" / red "Delete station"; both locked and the close button hidden while the request is in flight. `DELETE /stations/{slug}`; success toast "Station deleted", `router.push("/dashboard")` + `refresh` (lands on onboarding); failure toast "Couldn't delete the station. Nothing was removed."

API (`destroy`): `authorize('delete')` (owner), `$station->delete()` (soft), JSON `{ message: "Station deleted." }`. Effects:
- `StationObserver::deleting` runs `supervisor->down($station)` (container stops; failures are swallowed to the log).
- `desired_state` is **not** cleared and no open `StreamSession` is closed, and the endpoint does not check whether a broadcast is in progress. A trashed station drops out of `Station::running()` (soft-delete scope), so the reconciler ignores it.
- The row disappears from `/stations`, and route binding 404s on its slug.
- `StationObserver::restored` would bring it back to whatever state it was in, but nothing in the app calls `restore()` (verified by grep of `api/app`); a restore is a manual database or tinker act.

Pruning: `stations:prune-deleted` (`PruneDeletedStations`) runs daily at 04:40 (`routes/console.php`, `withoutOverlapping`, `runInBackground`). It selects `onlyTrashed()` rows with `deleted_at` older than `config('liquidsoap.deleted_station_retention_days')` (`LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS`, default 30; `<= 0` disables pruning), and force-deletes them **one at a time** so `StationObserver::forceDeleted` fires (wipes the playlist tree on disk and, through the supervisor, the rendered `.liq` and HLS artifacts; `tracks` rows go by FK cascade). Options `--days=` and `--dry-run`. A failure is reported and retried the next day. **Uploaded artwork files** (`storage/uploads/images`) are never deleted by this or by an artwork replace.

Account deletion (`/dashboard/settings`) soft-deletes each of the user's stations through the same observer (`UserObserver::deleting`, individually so events fire); force-deleting a user force-deletes their stations.

## Station settings page

`stations/[slug]/settings/page.tsx`, server component, one `GET /stations/{slug}` (which loads `streamSessions, schedules, autodjSlots.playlist, defaultPlaylist` and opts into the `encoder` block via `withEncoder()`). Max width `3xl`. Sections in order:

1. **Details** card: artwork, name, genre badge, description (italic placeholder "No description yet - two lines telling listeners what you play." when empty) and "Edit station profile" (the same `StationFormDialog`).
2. **Links** (`#links`): `LinksEditor`.
3. **Show times** (`#show-times`): `ShowTimesSection` (timezone picker plus the show-times editor). The editing rules, the timezone rules, and the fact that show times do nothing but display are documented in [Schedule](schedule.md); this doc only notes the wiring below.
4. **Stream**: three read-only rows: **Player URL** (`env.appUrl/station/{slug}`), **Stream path** (`station.icecast_mount`, "/stream/{slug}", hint "Only exists while the station is on air"), **Format** (literal `STREAM_FORMAT = "MP3 128 kbps, 44.1 kHz"`, hardcoded in this file, must be kept in sync by hand with `station.blade.php`). If `NEXT_PUBLIC_APP_URL` is unset the Player URL renders as a relative `/station/{slug}`.
5. **Encoder** (`EncoderSection`/`EncoderCard`): three states. The `id="encoder"` anchor is on the *available* card only; the locked and unavailable cards have no id, so `#encoder` deep links do nothing on those. Locked (`useEncoderLocked`): "Broadcast from your own software" with Pro badge and "Request Pro". Plan allows but `station.encoder` absent (no `LIQUIDSOAP_ENCODER_HOST`, i.e. no ingest router): "External encoder ingest isn't available on this server yet." Available: five values via `EncoderConnection` (Server, Port, Mount, Username, Password, each with a copy button; the password is masked as 24 dots until revealed; a collapsible "Where these go in BUTT, Mixxx and ffmpeg" with per-client steps and an ffmpeg command; a link to `/help/my-encoder-wont-connect`), a "New key" button (`POST /stations/{slug}/stream-key`, confirm dialog first; the response's new key is shown immediately and revealed until the refreshed prop's `rotated_at` catches up) and four support notes (switch the station on first; Icecast 2 not Shoutcast; a new key doesn't kick a live encoder; plain-text connection). The `encoder` block is only sent to the owner, on a plan with `encoder_enabled`, when `liquidsoap.encoder_host` is set, and only from `show()` and the rotate endpoint. An undecryptable stored key comes back as `password: null` with a logged warning (recovery is "New key"). Full behaviour: [Encoder ingest](encoder-ingest.md).
6. **Danger zone**: `DeleteStation` (above).

### `LinksEditor` in detail

Rows of `{ url, label }`, max 8 (`MAX_SOCIAL_LINKS`, client and server both 8; the Add button disables when full and the footnote changes). Per row: an icon that resolves live from the pasted address, a URL input (`maxLength` 2048, placeholder `instagram.com/yourstation`, `inputMode="url"`), a name input (`maxLength` 30, width fixed, placeholder is the platform name for known hosts, else "Name (optional)"), and a remove button.
- `normalizeSocialUrl` prepends `https://` when the input has no scheme, applied **on blur** (not per keystroke) and again on save.
- Focusing an empty name input on an **unrecognised** host prefills it with the hostname (`suggestSocialLabel`); recognised platforms stay blank because the glyph is the label.
- `resolveSocialLink` only accepts `http:`/`https:` URLs; hosts are matched (leading `www.` stripped, walking up subdomains) against a 38-entry table (`PLATFORMS`: Instagram, Facebook, X/Twitter, YouTube, TikTok, SoundCloud, Bandcamp, Spotify, Apple Podcasts, Deezer, Tidal, Twitch, Kick, Discord, Telegram, WhatsApp, Threads, Bluesky, Mastodon, Reddit, Linktree, Patreon, PayPal, Cash App, LinkedIn, Pinterest, Snapchat, VK, GitHub, Medium and some alternate domains; Mastodon is matched only for `mastodon.social`). Everything else gets a globe icon and its hostname (or the label).
- Save (`Save links`, `PUT /stations/{slug}` with only `{ social_links }`): empty-URL rows are dropped silently; if the only change is empty new rows it toasts "Paste a link into the new row first." and focuses the row instead of a fake success; any unparseable URL toasts `"{url}" doesn't look like a web address.` before the request; success toasts "Links saved" and `router.refresh()`; a 422 toasts the first server message. Empty label is sent as `null`.
- Order is the array order and is what the player page shows.

### `ShowTimesSection` wiring

Holds the station timezone (`chosen`, or the browser's zone when the station has none, read after mount to avoid a hydration mismatch) and the rows. `ShowTimesEditor` saves both in one `PUT /stations/{slug}/schedules` with `{ timezone, schedules }` (show name max 60, default start `20:00`; client-side refusals: rows with no timezone, no days, or an empty time), so this is the only place the timezone is sent from. It warns on unload (`beforeunload`) when either is dirty. A null station timezone shown as the browser zone is **not** counted as a change until the owner picks one. `TimezoneCombobox`: options from `Intl.supportedValuesOf("timeZone")` (falls back to the browser's own zone if unsupported; a current value not in the list is prepended), typeahead that treats spaces as underscores, at most 50 matches (`MAX_RESULTS`), each with a live "GMT+N" hint (display only; the IANA name is what is saved), arrow/Enter/Escape keyboard handling, ARIA combobox roles. See [Schedule](schedule.md) for the rest.

## Account page (`/dashboard/settings`)

A client component reading the `user` cookie (`getUser()`); until that mounts it shows a skeleton. Title "Account". Cards:

- **Plan** (`PlanCard`, renders nothing while the plan is unknown): plan name, "Up to {max_listeners} listeners at once." plus either "Your station plays only while you're broadcasting." (AutoDJ locked) or "...with AutoDJ keeping your station on air when you're not live.", and a "Request Pro" button when locked ("Request sent" after).
- **Profile**: Name and Email (both `required`). Submitting sends `PATCH /account/profile` with only changed fields; nothing changed toasts "Nothing changed". Changing email reveals a "Current password" field, required client-side (inline error "Current password is required to change your email." or the server's `errors.current_password[0]`). On success the cookie user is refreshed (`saveAuth(null, updated)`); if `email_verified_at` is now null the `VerifyEmailDialog` opens.
- **Change password** / **Set password** (Google-only accounts, `has_password === false`): current password (only when the account has one), new password and confirmation (`minLength=8`, one shared show/hide toggle). `PATCH /account/password`. Copy warns other sessions are signed out on change. Errors toast the first validation message.
- **Danger zone**: "Delete account" opens a dialog listing consequences and requiring the account email typed (case-insensitive, trimmed) to enable "Delete forever" (`DELETE /account` with `{ confirmation }`, then `clearAuth()`, toast, `router.push("/")`). The dialog bullets say "End your access" and "you won't be able to bring them back", but the card above it says "permanently removes your stations and broadcast history" and the dialog title says "This is permanent"; in fact stations are soft-deleted (30 days, see Delete above) and the account row is soft-deleted with its email scrambled, not erased.

The API side of these three endpoints is in [Auth](auth.md) and [Accounts, plans, invites](accounts-plans-invites.md). The routes sit **outside** the `verified` group on purpose, so an unverified user can fix a mistyped email or delete the account.

## Data model: `stations` table

Model `App\Models\Station` (`HasUuids` string primary key, `SoftDeletes`, `LogsActivity`, `$guarded = []`, route key `slug`). Columns as built by the migrations (the original `plan`, `is_live`, `stripe_*` and the AutoDJ cursor columns are dropped):

| Column | Type / default | Cast | Notes |
|---|---|---|---|
| `id` | uuid PK | | |
| `container_index` | unsigned int, unique | | Set in `StationObserver::creating`; never reused |
| `user_id` | FK users, cascade delete | | |
| `name` | varchar(100) | | |
| `slug` | varchar(60), unique | | Generated once; includes trashed rows in the uniqueness check |
| `description` | text null | | |
| `genre` | varchar(255) null | | |
| `timezone` | varchar(64) null | | IANA; see [Schedule](schedule.md) |
| `artwork_url` | varchar(255) null | | Column is 255 wide but the rule allows 2048 chars: a URL over 255 fails at the database, not as a 422 |
| `desired_state` | enum stopped/running, default stopped, indexed | | Owner intent |
| `started_at`, `last_ready_at`, `silent_since` | timestamps null | datetime | Lifecycle, [Station lifecycle](station-lifecycle.md) |
| `autodj_last_playlist_id` | char(26) null | | Monitoring only |
| `icecast_mount` | string | | `/stream/{slug}` |
| `icecast_password` | string | | Random 32; never in the resource |
| `stream_key` | text null | `encrypted` | Encoder credential |
| `stream_key_rotated_at` | timestamp null | datetime | |
| `jingles_enabled` | bool default false | boolean | |
| `jingle_mode` | varchar(16) default interval | | `interval` or `tracks` |
| `jingle_interval_seconds` | uint default 1800 | integer | |
| `jingle_every_tracks` | uint default 5 | integer | |
| `social_links` | json null | array | |
| `theme_config` | json null | array | Unused |
| `featured`, `featured_at` | bool default false indexed, timestamp null indexed | boolean, datetime | Admin-only, via `markFeatured()` |
| `created_at`, `updated_at`, `deleted_at` | timestamps | | |

`is_live` is **not** a column: it is derived from an open `stream_sessions` row (`Station::isLive`, `scopeLive`). Relations: `user`, `streamSessions`, `events`, `listenerStats`, `tracks`, `musicTracks`, `jingles`, `playlists`, `defaultPlaylist`, `autodjSlots`, `schedules`, `notifySubscriptions`. Constants: `MAX_SOCIAL_LINKS = 8`, `FEATURED_RAIL_SIZE = 4`, `DEFAULT_JINGLE_INTERVAL_SECONDS = 1800`, `DEFAULT_JINGLE_EVERY_TRACKS = 5`. Scopes `running`, `live`, `featured`, `indexable`, `withIndexability`.

### Limits per plan

`plans.max_stations` (Free 1, Pro 5) is read in exactly one place: `StoreStationRequest::authorize`. `plans.max_running_stations` (Free 1, Pro 5) is enforced by the start path ([Station lifecycle](station-lifecycle.md)). Other plan columns that shape this dashboard reach the client through `UserResource.plan` (`GET /user`): `slug, name, autodj_enabled, analytics_days, max_listeners, embed_enabled, encoder_enabled, watermarked, expires_at`. The client deliberately does not receive `max_stations`. Current caps set by migration `2026_09_02_100000_raise_plan_listener_caps.php`: Free 100 listeners, Pro 1000, shown only as text on the Account and plan cards. `watermarked` is sent and typed but must not be rendered (built, never enabled; see `client/interfaces/Plan.ts` and `Station.ts`).

## API surface used by this dashboard

| Method and path | Controller | Auth | Purpose |
|---|---|---|---|
| `GET /stations` | `StationController::index` | sanctum, verified | The account's non-deleted stations, **unordered**, no pagination; no `encoder`, `schedules`, `stats`. Used by `getMyStation` and the mobile home. |
| `POST /stations` | `store` | + plan limit | Create (201) |
| `GET /stations/{slug}` | `show` | owner (`view`) | Loads `streamSessions` (all rows, to compute stats), `schedules`, `autodjSlots.playlist`, `defaultPlaylist`; adds `encoder`, `programme`, `stats` |
| `PUT /stations/{slug}` (also PATCH) | `update` | owner | Profile, links, timezone, jingles |
| `DELETE /stations/{slug}` | `destroy` | owner | Soft delete |
| `GET /stations/{slug}/sessions` | `StreamSessionController::index` | owner | `latest('started_at')->paginate(20)`, raw paginator JSON (top-level `data`, `total`). Used by the Overview, Broadcasts and the mobile station screen |
| `POST /stations/{slug}/sessions`, `DELETE /stations/{slug}/sessions/{id}` | `store`, `destroy` | owner (`update`) | Routed but **called by nothing in the web client or mobile app** (reserved for a desktop client): `store` refuses with 409 `station_already_live` when another device or an encoder session holds the mount and dispatches the live notification after 2 minutes; `destroy` ends the session and clears `metadata:{id}` |
| `POST /upload/{type}` (`images` or `sounds`) | `UploadController` | sanctum, verified, `throttle:uploads` (20/min per user, `AppServiceProvider`) | Artwork file to `storage/uploads/images`, returns `data.url`. `sounds` (mp3/wav/ogg/flac/aac, 50 MB) is the same endpoint; the dashboard only uses `images` |
| `GET /stations/{slug}/status`, `POST .../start`, `.../stop` | other controllers | owner | [Station lifecycle](station-lifecycle.md) |
| `GET /user` | `AuthController::user` | sanctum | Plan and entitlements |
| `PATCH /account/profile`, `PATCH /account/password`, `DELETE /account` | `AccountController` | sanctum, **not** verified-gated | Account page |

`StationPolicy`: `view/update/delete` are `user->id === station->user_id`; `viewAny/create` are `true` and unused (the limit lives in the FormRequest). Non-owner access is a 403, which the client presents as not-found.

### `StationResource` fields (what the client receives)

Always: `id, user_id, name, slug, description, genre, timezone, artwork_url, featured, is_live, is_on_air, desired_state, started_at, state, now_playing, icecast_mount, hls_url, jingles_enabled, jingle_mode, jingle_interval_seconds, jingle_every_tracks, social_links, theme_config, created_at, updated_at`. Conditional: `indexable` (only when the public show endpoint loaded `withIndexability`); `watermarked` (owner only); `encoder` (owner, plan, deployed, and `withEncoder()`); `schedules` (when loaded); `autodj_slots` and `programme` (when `autodjSlots` loaded, which is `show()` and the slot save); `stats` (only when `streamSessions` is loaded, i.e. `show()`).

- `state` is **intent-derived and cheap**: `offline` unless `desired_state === running`, then `live` if an open session exists, else `on_air`. It never says `starting` or `degraded` (only `/status` does). `is_on_air` is simply "is running", true even on silence.
- `stats`: `sessions` and `total_airtime_seconds` come from **closed** sessions; `peak_listeners` is `max(listener_stats_hourly.peak_listeners)` (one extra aggregate query); `has_listeners` is `peak > 0` or any `listener_sessions` row for the station.
- `now_playing` comes from Redis `metadata:{id}` and is null when the station is stopped.
- `hls_url` is `{liquidsoap.hls_base_url}/{slug}/{liquidsoap.hls_variant}.m3u8`, null if no base URL is configured.
- List responses batch the Redis `MGET` and the live-session lookup (`preloadFor`) to stay N+1-free; single responses do one Redis `GET` and one query.

## Client interfaces (`client/interfaces/`)

Hand-written TypeScript mirrors of API payloads. There is no generated schema, so they drift silently.

| File | Describes | Notes |
|---|---|---|
| `Station.ts` | `Station`, `StationSchedule`, `SocialLink`, `StationEncoder`, `AutodjSlot`, `Programme` | `state` typed `offline | on_air | live` (the resource never sends `starting`/`degraded`). `theme_config` typed, unused. `watermarked` flagged in the file as not to be rendered. |
| `StationStatus.ts` | `/status` payload | Adds `starting`, `degraded`; `broadcaster` (null on old containers), `live_source {type, client}`, `elapsed`/`remaining`, `up_next`, `playlist_length`, `icecast_connected`, `last_ready_at` |
| `StreamSession.ts` | session rows | `source_type` `browser | electron | external`; `electron` is reserved, nothing writes it |
| `Plan.ts` | `GET /user` plan block; `PRO_PRICE_USD = 15`; `PRO_AVAILABLE = false` | no `max_stations` on purpose |
| `User.ts` | user; `plan` present on `/user` but **absent from the `user` cookie** | read the plan via `usePlan()` |
| `Playlist.ts`, `Track.ts` | library payloads | [Library and playlists](library-and-playlists.md) |
| `Audience.ts`, `Notification.ts` | audience report, notifications | not read for this doc; see [Listener analytics](listener-analytics.md), [Notifications](notifications-and-email.md) |

## Surfaces

| Surface | What it does here |
|---|---|
| Web dashboard | Everything above. |
| Mobile app | Reads `GET /stations` on its home screen (`mobile/src/app/home.tsx`); creating or deleting a station is a web-only action (no mobile call found). See [Mobile station screens](mobile-station-screens.md). |
| Player page | Shows name, genre, description, artwork and links from the same `StationResource`; [Public player and embed](public-player-and-embed.md). |
| Admin | Admin panel can feature stations and shows `max_stations` per plan; [Admin panel](admin-panel.md). |
| Help | `/help/turning-your-station-on-and-off` (from the power card `HelpLink`). `HelpLink` is meant to be used sparingly and always opens a new tab. |

## Gaps and traps

1. **One station per account is a client convention.** The API allows `max_stations` (Free 1, Pro 5). A Pro user creating a second station via API gets it silently ignored by the dashboard, which resolves the oldest. The create-dialog 403 text "Each account has one station, and yours already exists." is therefore only accurate for Free.
2. **Editing name, genre, description or artwork restarts a running station** and drops listeners; the form gives no warning. Only jingles, timezone and links are restart-free.
3. **Edit-form 403 message is wrong in edit mode.** Any 403 (for example the `email_unverified` middleware response) toasts "Each account has one station...". The axios interceptor also toasts "Verify your email to continue." for that code.
4. **Form errors are invisible for genre, description and artwork.** Only `name` renders a `FieldError`; a rejected `artwork_url` or `genre` produces no message and the dialog just stays open.
5. **Artwork limits disagree.** Hint says max 2 MB; server allows 5 MB and also accepts gif; the file input's `accept` excludes gif. Nothing enforces the 2 MB.
6. **`artwork_url` accepts any http(s) URL** and the column is `varchar(255)` while the rule allows 2048 (a long URL 500s at the database). `next.config.ts` `images.remotePatterns` allows only `https://{host of NEXT_PUBLIC_API_URL, else api.gocast.fm}/storage/**`, `https://lh3.googleusercontent.com/**` and `http://localhost:8000/storage/**`, so an arbitrary external artwork URL fails in the Next image optimizer (in development images are `unoptimized`, so the problem only appears in a production build).
7. **Uploaded artwork is never deleted**, on replace, on station delete or by the prune.
8. **`description` has no length limit** at the API or in the form.
9. **Cancel keeps unsaved edits** in `StationFormDialog` (state is initialised once and the component stays mounted); the checklist's separate dialog instance has its own copy.
10. **Delete copy vs behaviour.** The dialog says "This can't be undone" and that history is lost; in reality the rows and audio survive 30 days (`stations:prune-deleted`) and restore is possible by hand. `desired_state` is not reset, so a restored running station comes straight back on air. Delete does not check for a live broadcast or close its open `StreamSession`. Artwork files stay forever.
11. **`/dashboard/station/{path}` allowlist omits `schedule`** (and anything nested). A link to `/dashboard/station/schedule` lands on the Overview.
12. **Sidebar Overview matcher is a hand list** of excluded sub-routes; a new station sub-page is highlighted as Overview until it is added.
13. **Layout trusts the `user` cookie**: a malformed cookie throws instead of redirecting; `email_verified_at` and identity come from the cookie, not `/user`.
14. **`state` on the page payload can lie for the first seconds**: it is intent-only. `StationPower` guards this with "Checking..." until the first poll, but any other consumer of `station.state` (the header text `Last live`, the overview `isOnAir` prop passed to `LiveListeners`) is intent-based.
15. **`StationActivity` truncation is coarse.** `truncated` is `total sessions > sessions fetched` (page size 20, and open sessions count towards `total`), so once a station has more than 20 lifetime sessions the prior-period comparison is always suppressed and the 14-day counts cap at what fits in the latest 20.
16. **`StationChecklist` "Fill the default playlist"** is evaluated against the active programme playlist's tracks, and disappears from the list on Free. The title over-claims.
17. **`show()` loads every stream session** for `stats`; cost grows with broadcast history.
18. **Hardcoded strings that must be hand-synced**: `STREAM_FORMAT` in the Overview ("Streams in MP3, 128 kbps") and again in settings ("MP3 128 kbps, 44.1 kHz"), and `gocast.fm/station/{slug}` in the edit dialog. If `NEXT_PUBLIC_APP_URL` is unset the Player URL is relative.
19. **`theme_config` and `watermarked` are dead** (validated/stored/sent, rendered nowhere). Do not build on them.
20. **Slug is immutable**, so a renamed station keeps its old URL forever; the observer's slug-change code is unreachable through the API.
21. **Plan data is per layout render.** After a Pro grant, the sidebar and locks only change on the next full dashboard render (`router.refresh()` or reload); `ProRequestContext.requested` is not persisted.
22. **No client tests** cover the dashboard beyond the Playwright `auth.spec.ts` and `help-screenshots.spec.ts` in `client/tests/e2e`.
23. **`#encoder` only works in one card state.** `id="encoder"` is on the available `EncoderCard` only, not on the locked or the "isn't available on this server" cards.
24. **`timezone` on `PUT /stations/{slug}` has no sender.** Both apps set the zone through `PUT .../schedules`, so the `UpdateStationRequest` timezone-clear guard is only reachable by direct API calls.
25. **`POST`/`DELETE /stations/{slug}/sessions` are unused** by web and mobile. `destroy` authorises on the station but does not check that the session belongs to it (no `scoped()` on the nested route).
26. **`/dashboard/broadcasts` masks every failure as 404** (`catch { notFound() }`), including 5xx and timeouts, and shows only the newest 20 sessions with no way to page.
27. **Not read line by line for this doc**: the `NotificationBell` popover body and `NotificationItem`/detail dialog (only the 60 s poll was confirmed), and the middle of `GoLiveTrigger` (encoder pane). Both are owned by other docs.

## Tests

- `api/tests/Feature/Models/StationSlugTest.php`: slug generation, collision suffixes, emoji fallback, soft-deleted collision, immutability, create via API.
- `api/tests/Feature/Models/StationSoftDeleteTest.php`, `UserSoftDeleteTest.php`: soft delete and cascade from user.
- `api/tests/Feature/PruneDeletedStationsTest.php`: window, `--days`, disabled retention, `--dry-run`, deleted accounts.
- `api/tests/Feature/StationSocialLinksTest.php`: order, clear, protocol allowlist, required url, unknown keys, max 8, label length, public visibility, cross-owner block.
- `api/tests/Feature/StationObserverTest.php`, `StationJingleSettingsTest.php`, `StationEncoderResourceTest.php`, `StreamKeyRotationTest.php`, `StationStatsTest.php`, `StationPowerControllerTest.php` (creates a station off air), `Auth/EmailVerificationEnforcementTest.php` (station routes need a verified email).
- `DerivedStationStateTest.php` (the intent-derived `state`/`is_live`/`is_on_air` vs `/status`), `StationContainerIndexTest.php` (index allocation, never reissued), `StationHlsUrlTest.php` (`hls_url`).
- No test found for `StoreStationRequest` plan-limit rejection or for `UpdateStationRequest` timezone-clear guard beyond the schedule tests in `StationScheduleTest.php` ([Schedule](schedule.md)). No component tests for the dashboard UI.

## History

- Plans and handoffs (history only, not spec): `docs/AUTODJ-SCHEDULING-HANDOFF.md`, `docs/MOBILE-APP-HANDOFF.md`. Related feature docs: [Schedule](schedule.md), [Station lifecycle](station-lifecycle.md).
