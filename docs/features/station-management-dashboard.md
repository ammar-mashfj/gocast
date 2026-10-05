---
feature: Station management dashboard (shell, overview, station CRUD, settings)
verified: 2026-10-05 against c970b2d plus uncommitted work (feat/design-system: jingle lists, AutoDJ nav regroup)
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
  - client/app/dashboard/settings/layout.tsx
  - client/app/dashboard/settings/page.tsx
  - client/components/dashboard/AppSidebar.tsx
  - client/components/dashboard/StationFormDialog.tsx
  - client/components/dashboard/HelpLink.tsx
  - client/components/dashboard/EncoderConnection.tsx
  - client/components/dashboard/EmbedDialog.tsx
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
  - client/app/dashboard/design-system/page.tsx
  - client/app/dashboard/stations/[slug]/settings/ProfileCard.tsx
  - client/app/dashboard/stations/[slug]/settings/LinksCard.tsx
  - client/app/dashboard/stations/[slug]/settings/StreamCard.tsx
  - client/app/dashboard/stations/[slug]/settings/DeleteStation.tsx
  - client/app/dashboard/stations/[slug]/settings/TimezoneCombobox.tsx
  - client/app/dashboard/broadcasts/loading.tsx
  - client/components/dashboard/shell/DashboardShell.tsx
  - client/components/dashboard/shell/TopBar.tsx
  - client/components/dashboard/shell/StationBand.tsx
  - client/components/dashboard/shell/TabBar.tsx
  - client/components/dashboard/shell/UpdatesMenu.tsx
  - client/components/dashboard/overview/OverviewHeader.tsx
  - client/components/dashboard/overview/OverviewHero.tsx
  - client/components/dashboard/overview/NowPlayingWell.tsx
  - client/components/dashboard/overview/YourLinkCard.tsx
  - client/components/dashboard/overview/ComingUpCard.tsx
  - client/components/dashboard/overview/SetupChecklist.tsx
  - client/components/dashboard/overview/LiveShowsCard.tsx
  - client/components/dashboard/overview/RecentShowsCard.tsx
  - client/components/dashboard/share/TuneInCodeDialog.tsx
  - client/components/dashboard/share/ShareDialog.tsx
  - client/components/dashboard/shows/ShowsList.tsx
  - client/components/dashboard/station-form/StationForm.tsx
  - client/components/dashboard/station-form/ArtworkDrop.tsx
  - client/components/dashboard/account/PlanCard.tsx
  - client/components/dashboard/account/ProfileForm.tsx
  - client/components/dashboard/account/PasswordForm.tsx
  - client/components/dashboard/account/DeleteAccount.tsx
  - client/components/dashboard/account/VerifyEmailDialog.tsx
  - client/components/dashboard/ProRequestDialog.tsx
  - client/contexts/StationStatusContext.tsx
  - client/hooks/useStationStatusPoll.ts
  - client/hooks/useStationPower.ts
  - client/lib/dashboardNav.ts
  - client/components/dashboard/autodj/AutoDjSections.tsx
  - client/lib/airState.ts
  - client/lib/stationHero.ts
  - client/lib/comingUp.ts
  - client/lib/liveShows.ts
  - client/lib/showsTrend.ts
  - client/lib/share.ts
  - client/app/dashboard.css
  - client/eslint.config.mjs
  - client/hooks/useAccessRequest.ts
  - client/hooks/useEmailVerification.ts
  - client/lib/navigation.ts
  - client/lib/clipboard.ts
fingerprint: 0f621b8b8adde96b
---

# Station management dashboard

The signed-in web shell for one broadcaster: the sidebar, top bar, status band and phone tab bar, the station Overview, Your shows, station create/edit/delete, and the Station settings and Account pages. Everything is drawn with the dashboard design system (`components/ds/`, tokens in `client/app/dashboard.css`); `components/ui` is the marketing kit and only five of its primitives (skeleton, sidebar, slider, scroll-area, avatar) are used here, enforced by lint (see [Dev environment and testing](dev-environment-and-testing.md)). **A user has one station.** The client enforces that by always resolving "the" station as the oldest one the account owns (`client/lib/station-server.ts` `getMyStation`). The API does **not** enforce it: the plan row still allows one station on Free and five on Pro (`plans.max_stations`, created in `2026_04_16_131050_create_plans_table.php`, never lowered by a later migration). The UI hides that, so a second station made by API is invisible in the dashboard.

Other things that surprise people:

- **Editing the station profile on a running station restarts its Liquidsoap container.** `name`, `slug`, `description`, `genre` and `artwork_url` are in `StationObserver::LIQ_RELEVANT_COLUMNS`, so a changed value re-renders the `.liq` and calls `supervisor->up()`, which "always re-renders the .liq and restarts the container ... a restart drops connected listeners" (`LiquidsoapSupervisor::up` docblock). Show times, timezone, social links, `theme_config` are not in that list and never restart anything.
- **"Delete station" is a soft delete.** The container comes down at once; the row, audio and history stay for 30 days and are then erased by `stations:prune-deleted`. The dialog says "This can't be undone", and in the product that is true (no restore UI or endpoint exists), but the data is not gone for a month.
- **The station has two "states"** with different sources of truth: the server-rendered pages carry the cheap intent-derived `state`, while the status band, sidebar lamp and overview hero read the shared `/stations/{slug}/status` poll and paint the real one. See the shell and Overview below.

Everything about going on and off air, the studio, the library, the schedule and the audience is owned elsewhere: [Station lifecycle](station-lifecycle.md), [Web studio](broadcasting-web-studio.md), [Library and playlists](library-and-playlists.md), [AutoDJ](autodj.md), [Schedule](schedule.md), [Listener analytics](listener-analytics.md), [Encoder ingest](encoder-ingest.md), [Public player and embed](public-player-and-embed.md), [Accounts, plans, invites](accounts-plans-invites.md), [Auth](auth.md). This doc covers their entry points into the shell and what the shell itself does.

## Route map

All under `client/app/dashboard/`. Every route is inside `layout.tsx` and `error.tsx`.

| URL | File | What it is |
|---|---|---|
| `/dashboard` | `page.tsx` | Resolves the station. Has one: `redirect` to `/dashboard/stations/{slug}`. Has none: the create page ("Create your station" with `StationForm` right on the page). A failed `/stations` fetch throws to `error.tsx`. |
| `/dashboard/stations` | `stations/page.tsx` | Dead URL kept for old bookmarks. Always `redirect("/dashboard")`. |
| `/dashboard/library` | `library/page.tsx` | Forwarder. Station: redirect to `.../library`; none: `/dashboard`. Exists only because the sidebar's slugless Library fallback points here. |
| `/dashboard/station/{...path}` | `station/[[...path]]/page.tsx` | Slug-free deep link (singular "station"). Looks up the viewer's own station and redirects. Allowlist `STATION_PAGES = studio, live, library, audience, settings`; anything else (including `schedule`, multi-segment paths and typos) lands on the station Overview. No station: `/dashboard`. Built for announcement buttons (one payload for every account). |
| `/dashboard/stations/{slug}` | `stations/[slug]/(overview)/page.tsx` | The Overview (below). |
| `/dashboard/stations/{slug}/settings` | `.../settings/page.tsx` | Station settings (below). Anchors `#links` and `#show-times` are deep-linked from the checklist and elsewhere. |
| `/dashboard/stations/{slug}/live`, `/studio`, `/studio/wrap` | own docs | Go live, the studio and "That's a wrap". The sidebar's Studio item and the band link here. |
| `.../library`, `.../playlists`, `.../jingles`, `.../schedule`, `.../audience` | own docs | The four AutoDJ sections ([Library and playlists](library-and-playlists.md), [Schedule](schedule.md)) and Audience. |
| `/dashboard/broadcasts` | `broadcasts/page.tsx` | **Your shows** (below). |
| `/dashboard/settings` | `settings/page.tsx` | **Account** page (not station settings). Tab title "Account" via `settings/layout.tsx`. |
| `/dashboard/design-system` | `design-system/page.tsx` | The ds component gallery; `notFound()` in production. |

Per-station pages call `apiFetch('/stations/{slug}')` themselves and treat **403 and 404 the same**: `notFound()`. Rationale in code: a 403 from `StationPolicy::view` should not confirm that someone else's slug exists. A 401 goes to `/auth/login?expired=1` through `redirectIfSessionExpired(err)` (`client/lib/api-server.ts`), which the dashboard layout, the Overview, Station settings and Your shows call in their catch blocks; it is deliberately not inside `apiFetch`, because the public station page shares it and a listener must never land on a login form. `?expired=1` also gets past the proxy's "already signed in" bounce. Any other failure (timeout after 10 s, 5xx) is logged and rethrown to `error.tsx` (`apiFetch`: `TIMEOUT_MS = 10_000`, `no-store`, bearer token from the `token` cookie). The browser-side axios instance (`client/lib/axios.ts`) does: any 401 outside `/login`/`/register` runs `clearAuth()` and navigates in-app (`lib/navigation.ts` `navigate`, no reload) to `/auth/login?expired=1`, at most once per 2 s; a 403 with `code: "email_unverified"` toasts "Verify your email to continue.".

## The shell (`layout.tsx`)

A server component. In order:

1. Reads cookies `token` and `user`. Missing either: `redirect("/auth/login")`. `JSON.parse(decodeURIComponent(userCookie))` is unguarded, so a corrupt `user` cookie throws to the error boundary rather than redirecting.
2. `user.email_verified_at` falsy (from the cookie): `redirect("/auth/login")`. The login page reopens the verify modal from the dangling cookie.
3. Two parallel fetches, each with its own failure fallback (logged, never fatal):
   - `GET /user` into `Account { email, plan }`. A 401 redirects to `/auth/login?expired=1` (the one place an expired session is caught for every dashboard route, the client-rendered studio included). On any other failure `plan` is `null`, and every plan hook then answers "unlocked/unknown", never "Free".
   - `getMyStation()` (React `cache()`d, one `/stations` request per render) into `CurrentStation { slug, name, artwork_url, genre, description, timezone }`. On failure `null`.
4. Renders providers outermost to innermost: `RealtimeProvider(userId)` > `BroadcastProvider` > `AccountProvider` > `ProRequestProvider` > `StationProvider` > `StationStatusProvider` > `SidebarProvider data-surface="dashboard"`, then `AppSidebar` and `DashboardShell` (`components/dashboard/shell/`), which holds the sticky chrome (`TopBar` over `StationBand`), the page body (`px-gutter`, capped at `max-w-page`) and the phone `TabBar`.
5. Metadata: title default "Dashboard", template `%s — GoCast`, `robots: noindex, nofollow`.

`data-surface="dashboard"` is what scopes the dashboard design system: `app/dashboard.css` lifts it to `<html>` with `.dark:has([data-surface="dashboard"])`, so dialogs and menus portalled outside the tree still get the dashboard tokens. `DashboardShell` measures the chrome and publishes its height as `--chrome-h` on `<html>`, which the dashboard scope uses as `scroll-padding-top`, so `#links` / `#show-times` anchors land below the sticky bar.

The broadcast (mic, mixer, encoder) lives in `BroadcastProvider`, above every page in the shell, so navigating between dashboard pages does not end a show. Anything that does a full page load (`<a href>`, `window.location`) does. That is why studio links use `Link` and Help opens in a new tab.

### Contexts

| Context | Holds | Notes |
|---|---|---|
| `StationContext` (`useCurrentStation`, `useStationBySlug`) | Identity: slug, name, artwork, genre, description, timezone | Set once per layout render. `useStationBySlug(slug)` returns null when the route slug differs from the resolved station. Goes stale after an edit until something re-renders the layout (`router.refresh()` does). |
| `StationStatusContext` (`StationStatusProvider`, `useSharedStationStatus`) | One `useStationStatusPoll` for the account's station | Everything that asks for that station's status through `useStationStatus(slug)` (band, sidebar lamp, overview hero, library) shares this one poll. A caller passing its own `intervalMs`, or another slug, runs its own poll (whose `showEnding` is always false). Passthrough when there is no station. When this tab's show ends (`useRereadWhenShowEnds`), it re-reads at once and every 1.5 s until a status shows nobody connected and `source !== "live"`, for at most 15 s; meanwhile `showEnding` is true and a `browser` `live_source` in the stale status is masked (`broadcaster: false`, `live_source: null`), so nothing reads this tab's finished show as "live from another browser". |
| `AccountContext` (`useAccount`, `usePlan`) | `{ email, plan }` | Not refreshed mid-session except by a layout re-render. |
| Lock hooks | `useAutoDjLocked` = plan known and `!autodj_enabled`; `useAudienceLocked` = plan known and `analytics_days <= 0`; `useEmbedLocked` = `!embed_enabled`; `useEncoderLocked` = `!encoder_enabled` | All return `false` when the plan is `null`. UI gates only; the API enforces. |
| `ProRequestContext` (`useProRequest`) | `open()` and `requested` | Owns one `ProRequestDialog` (`components/dashboard/ProRequestDialog.tsx`, ds kit, prefilled with the account email). The form's rules are `hooks/useAccessRequest.ts`, shared with the marketing `ProAccessDialog`. `requested` flips true after a submit and is per page-load state, not persisted. Pro is granted by hand: `PRO_AVAILABLE = false` in `client/interfaces/Plan.ts`, `PRO_PRICE_USD = 15`. |

### Navigation (`lib/dashboardNav.ts`)

One list, `NAV_ITEMS`, drives the sidebar, the phone tab bar and the top bar's breadcrumb. Each item has a slugless fallback `href` and, once a station is resolved, a `stationHref`. The four AutoDJ sections carry `group: "autodj"` (`AUTODJ_ITEMS`); the lock and the on-air lamp belong to the group heading (`AUTODJ_GROUP`), not the children.

| Item | With station | Fallback | Lock |
|---|---|---|---|
| Overview | `/dashboard/stations/{slug}` | `/dashboard` | |
| Studio | `.../live` (the **broadcasting** station's `.../studio` while this tab broadcasts) | `/dashboard` | |
| *AutoDJ* (group heading, links to Library) | | | AutoDJ |
| ↳ Library | `.../library` | `/dashboard/library` | (the heading's) |
| ↳ Playlists | `.../playlists` | `/dashboard` | (the heading's) |
| ↳ Jingles | `.../jingles` | `/dashboard` | (the heading's) |
| ↳ Schedule | `.../schedule` | `/dashboard` | (the heading's) |
| Audience | `.../audience` | `/dashboard` | Audience |
| Your shows | `/dashboard/broadcasts` | same | |
| Settings (station) | `.../settings` | `/dashboard` | |

`activeNav(pathname)` maps `/dashboard` and a bare station path to Overview, `/dashboard/library` to Library, `/dashboard/broadcasts` to Your shows, and the station sub-segment through `SEGMENT_TO_KEY` (`live`/`studio` Studio, `library`, `playlists`, `jingles`, `schedule`, `audience`, `settings`); anything else is null (no item lit). `inAutoDj(key)` says whether a key is one of the AutoDJ sections. `pageLabel` gives the breadcrumb's page name: null on the overview, "Account" for `/dashboard/settings`, "Design system" for the gallery, else the item's label. Covered by `lib/dashboardNav.test.ts`.

### Sidebar (`AppSidebar.tsx`)

Header: the GoCast logo (to `/dashboard`) and, with a station, a station card (artwork, name, and a `StatusLamp` with the band's coarse state from `airState`). Items: the table above. The AutoDJ group is drawn once as a `role="group"`: a heading link (bold while any section is open) over the four sections, indented with a rule down their left edge (`NavLink nested`). A locked item stays clickable and carries an amber **PRO** tag (for AutoDJ, on the heading only). Studio shows a pulsing red "Live" lamp while this tab broadcasts or the station is live; the AutoDJ heading shows a violet "On" lamp while AutoDJ is on air. Below 1024 px each AutoDJ page also opens with `AutoDjSections` (`components/dashboard/autodj/`), a row of links between the four sections. Below 1024 px (`useIsMobile(1024)`, matching the sidebar's `lg:` classes) the sidebar is a drawer, closed on every route change.

Footer:
- **Plan card**, only when `useAutoDjLocked` (Free, plan known): "{plan name} plan", an amber "Request Pro" button (becomes "Requested"), and "Your station goes silent when you stop broadcasting." (after a request: "Request sent — we'll be in touch.").
- **Account menu** (avatar, name, email; a PRO tag when a plan is known and AutoDJ isn't locked). Menu: "Account and plan" (`/dashboard/settings`), Help (`/help`, new tab), Sign out. Signing out while broadcasting first asks "Sign out and end your broadcast?" (Stay signed in / End and sign out).

### Top bar (`shell/TopBar.tsx`)

Sidebar toggle, a breadcrumb "{station name} › {page}" (the station name links to the overview), the **station clock** ("THU 14:37 · LONDON", `formatStationClock` in the station's timezone, rendered after mount, re-read each minute, hidden below `sm`, absent when the station has no timezone) and **Updates** (`shell/UpdatesMenu.tsx`, the notification popover; [Notifications](notifications-and-email.md)).

### Status band (`shell/StationBand.tsx`)

Under the top bar on every page while a station exists. What it says comes from `airState` (`lib/airState.ts`, pure, `airState.test.ts`), which ranks this tab's own broadcast above the poll:

| Band (label) | When | Action |
|---|---|---|
| LIVE / LIVE · MIC / fault label (amber) | This tab is live or reconnecting; tone and sentence from the studio signal | Close mic (mic latched), else Open studio (not on the studio page) |
| SHOW ENDED | This tab's show just ended and the station is still handing over (`showEnding`): "Your show has ended. Checking what’s on air now…" | none |
| CHECKING | No status yet, first read in flight | none |
| NO ANSWER | No status after the read, or `!reachable` | none |
| OFF AIR | `state === "offline"` | Start AutoDJ, or Go live when AutoDJ is locked |
| STARTING | `starting` | none |
| NOT HEARD (amber) | `degraded` | none |
| LIVE | A broadcaster from DJ software, the app or another browser | none |
| SILENCE (amber) | `source === "silence"` | Add tracks |
| ON AIR · AUTODJ (violet) | otherwise, with the track | Go live |

While this tab broadcasts, the band also shows the show's uptime, the listener count, and (off the studio page) play/pause and next-track buttons for the studio queue. This replaced the old `LiveBanner` and `BroadcastMiniController`. A fault (amber) is also read out in full through an sr-only `role="alert"` line in `ds/StatusBand`.

### Phone tab bar (`shell/TabBar.tsx`)

Below 640 px, fixed to the bottom: Station, Studio, AutoDJ (opens Library; lit on all four AutoDJ sections via `inAutoDj`), Audience, and More (opens the sidebar drawer). Studio goes to the broadcasting studio while a show runs and shows a red dot. Not rendered without a station. It carries `data-slot="tab-bar"`, which `dashboard.css` uses below 40 rem to lift toasts above it (`--toast-offset-bottom: calc(4.5rem + env(safe-area-inset-bottom))`).

### Error boundary (`error.tsx`)

Sits inside the layout so the broadcast survives a page crash. Heading "This page didn't load". While live it says the broadcast is still on air and offers "Back to the studio" (the **broadcasting** station's studio); otherwise "Go to your station" (`/dashboard`). "Try again" calls `unstable_retry` (Next 16; re-fetches, unlike `reset`). A "Details for support" disclosure shows `error.message` and `digest`.

## Overview (`stations/[slug]/(overview)/page.tsx`)

Server component (tab title "Overview"). Fetches in parallel: `/stations/{slug}` (`show()`, so the payload carries `encoder`, `schedules`, `programme`, `stats`), `/stations/{slug}/sessions` (newest 20, plus `total`), and `/stations/{slug}/playlists` (failure swallowed to `null`). Only the station and sessions fetches are fatal (404/403 become `notFound()`). The page no longer fetches a playlist's tracks: the checklist counts the default playlist's `track_count` (when the playlists fetch failed it counts as filled, so the tile doesn't nag on a network error).

Sections, top to bottom (`components/dashboard/overview/`):

1. **`OverviewHeader`**: the artwork is itself a button that opens the edit dialog (an "ADD ART" caption when there is none), the name as the page `h1` with a genre `Tag`, the description (2 lines), and a meta line "Since {Mon YYYY}" plus "Last live {relative}" when the newest closed session exists and the station isn't live. Actions: "Player page ↗" (new tab) and "Edit profile" (`StationFormDialog`).
2. **`OverviewHero`**: two panels on one surface whose fill is the state (plain off air, violet AutoDJ, red live, amber when listeners hear nothing). Left: state label, a one-line title, a sentence, `NowPlayingWell` while AutoDJ plays (title · artist, time left and a progress bar drawn per animation frame from the last poll, "Up next"), and the controls. Right: `ListeningNow`, the public listener count (`useListenerCount`, counted up by `useCountUp`), with a line that changes with the state ("Your station is starting. Counting begins once it’s on air." while starting; off air "Go live to start counting." or, with AutoDJ, "Start AutoDJ or go live to start counting."; nobody listening: "Nobody right now. Your peak is N." when `stats.peak_listeners` > 0, else "Nobody yet. Share your link below.") and a link to Audience. The decisions are `stationHero` (`lib/stationHero.ts`, `stationHero.test.ts`); power calls are `useStationPower` (success toasts "Your station is starting up", since a start is only accepted, and "Station is off air").
3. **`YourLinkCard`** and **`ComingUpCard`** side by side.
4. **`SetupChecklist`**.
5. **`LiveShowsCard`** and **`RecentShowsCard`** side by side.

`loading.tsx` draws the same layout with skeletons (animation off under `prefers-reduced-motion`).

### The hero (`stationHero`)

| Label | When (first match) | Title |
|---|---|---|
| NOT REACHING LISTENERS (amber) | `state === "degraded"` | "Your station is running, but listeners can't hear it." |
| STARTING | `starting` | "Your station is starting…" |
| LIVE (red) | a broadcaster is attached | "You're live." / "You're live from {client}." / "…from another browser." / "Someone is live." |
| OFF AIR | not running | "Nothing's playing right now." |
| CHECKING / STATUS UNKNOWN | running, no status yet / no answer | |
| NO SOUND (amber) | `source === "silence"` | "Nothing is playing." |
| ON AIR · AUTODJ (violet) | otherwise | "Your station is playing itself." ("Your show has ended." while the live buffer drains) |

`broadcasterAttached` = running and (this tab is broadcasting, or the status is reachable and `broadcaster` is true, falling back to `live_source !== null` for old containers). It deliberately ignores `state`/`source`, which lag by the live arm's buffer.

Controls: **Go live** (to `.../live`; disabled while running and the status is unknown) whenever nobody is live; **Open studio** when live from this tab; **Hear your stream ↗** (player page) when live from elsewhere. Off air and not AutoDJ-locked adds **Start AutoDJ**; running (and not live from this or another browser) adds a stop button, "Stop AutoDJ" while AutoDJ plays (asks "Stop AutoDJ on {name}?", Keep playing / Stop AutoDJ) or "Turn station off". From an encoder the stop button stays, so the owner can cut off a leaked key: a stop refused with `code: "station_is_live_external"` opens "Cut off this broadcast?" and "Cut it off" re-sends stop with `{ force: true }`. Free stations get no Start AutoDJ (without AutoDJ an empty station emits silence and `stations:sweep` turns it off).

### `YourLinkCard`

"Your link": a `CopyField` that displays the bare player URL but copies `taggedStationUrl(appUrl, slug, "owner")` (`?utm_source=owner&utm_medium=share`). Buttons: **Tune-in code** (`share/TuneInCodeDialog`: a QR of the `qr`-tagged URL, 640 px canvas at level H with the logo excavated, violet `#4c1d95` modules on white, "Download PNG" as `{slug}-qr.png`), **Embed** (`EmbedDialog`, which puts focus on its Copy code button on open rather than in the preview iframe, where Esc would go to the player, and copies through `copyText`, toasting "Couldn't copy — select the code and copy it manually" when that fails; on a plan without embeds it opens the Pro request and carries a PRO tag) and **Share…** (`share/ShareDialog`: Copy link, WhatsApp, Email, X, and the system share sheet when `navigator.share` exists). Embed itself: [Public player and embed](public-player-and-embed.md).

### `ComingUpCard`

The next three things on the station (`lib/comingUp.ts`, `comingUp.test.ts`): each show time's next occurrence (yours, live) and AutoDJ's next slot change (`programme.next`, violet), in the station's timezone as "Today 21:00" / "Tomorrow 09:00" / "Fri 18:00". Rendered after mount (the clock). The header link goes to Show times when there are none, else to Schedule.

### `SetupChecklist`

Tiles for what's left, in order: Add station artwork and Write a description (both open `StationFormDialog`), Fill AutoDJ's playlist (`.../library`; omitted on Free), Set your show times (`.../settings#show-times`), Add your social links (`.../settings#links`), Get your first listener (`stats.has_listeners`, else `peak_listeners > 0`; no action). A segmented bar shows progress and "{done} OF {total}". The card disappears when everything is done, and "Hide for now" hides it per station in this browser (`localStorage` `gocast:setup-hidden:{slug}`).

### `LiveShowsCard` and `RecentShowsCard`

- **Your live shows** (`lib/liveShows.ts`, `liveShows.test.ts`), last 14 days of closed sessions, by the viewer's local start day: time on air with the change against the 14 days before (suppressed whenever the station has more sessions than the 20 loaded, since the comparison would be on partial data), number of shows and their average length, the peak and its date, and a bar per day. A caption says AutoDJ time isn't counted (that's in Audience).
- **Recent shows**: the newest 5 of the loaded sessions, each "Tue 29 Sept · 21:15" **on the station's clock** (same as Your shows and the top bar), where it came from ("From the studio" / "From {client}" / "From your DJ software" / "From the desktop app"), its length ("On air now" while open) and peak. "All shows →" goes to `/dashboard/broadcasts`.

## Your shows (`/dashboard/broadcasts`)

Server component (`broadcasts/page.tsx`, tab title "Your shows"). Fetches `/stations/{slug}/sessions?finished=1` for the resolved station; **any** failure becomes `notFound()`. Empty (or no station): the page title, "Nothing here yet…" and a **Go live** button (or "Create your station").

Otherwise the header reads "{n} shows · {airtime} live in total." from the API's `summary` (every finished show, not just the page), followed by one trend sentence from `lib/showsTrend.ts` (`showsTrend.test.ts`): the latest ≤5 shows against the ≤5 before, only with at least 3 on each side and a change of 15% or more (a peak change must also be at least one listener), e.g. "Your recent shows run shorter but draw more listeners at their peak." Nothing is said about how long people stay; that isn't measured.

`components/dashboard/shows/ShowsList.tsx` draws the table: STARTED (weekday date, and the start–end time on the **station's** clock), FROM (Studio / Desktop app, or for an encoder the software's name when it sent one, else Own software; hidden on a phone), ON AIR (off-white bar scaled to the longest loaded show, capped at 3 h, plus the length), PEAK. Each row is a button (`aria-expanded`) that opens two tiles: **Peak at** (from `stream_sessions.peak_at`: the time, "{n} listening at once"; "Nobody tuned in" or "Not recorded for older shows" when null) and **From** (the same name, with the encoder's software name under it). **Show more** loads the next page (`?finished=1&page=n`), de-duplicating rows that shifted because a show finished meanwhile; a failure says "Couldn't load more shows."

## Creating, editing and deleting a station

### Create

Only surface: `/dashboard` when the account has no station, which renders `StationForm` with no `station` in a card. Sidebar and tab links go there while none exists.

`POST /stations` (`StationController::store`, route inside the `verified` group):
1. `StoreStationRequest::authorize()`: `user->stations()->count() < user->plan->max_stations` (counts non-deleted stations only, so deleting frees a slot). Failure is a 403 with no station-specific message. A user whose `plan` relation were null would 500 here (`plan_id` defaults to 1 with an FK, so not reachable in normal data).
2. Rules: `name` required string max 100; `description` nullable string (no max); `genre` nullable string max 255; `artwork_url` nullable string `url:http,https` max 2048.
3. `$user->stations()->create($validated)`, refreshed, returned as 201 with `StationResource`.

What the `creating`/`created` hooks in `Station::booted` and `StationObserver::creating` do:
- `slug` = `Str::slug(name)` (empty result, e.g. emoji-only, becomes `station`), truncated to 55 chars, then `-2`, `-3`, ... until free. The uniqueness check uses `withTrashed()`, so a deleted station's slug is not reused until the row is force-deleted. Column is `varchar(60)` unique. **The slug is immutable**: it is not in `UpdateStationRequest`, and no hook regenerates it. Renaming changes the name only; the URL stays.
- `icecast_mount` = `/stream/{slug}`; `icecast_password` = `Str::random(32)`; `stream_key` = 32 chars `[A-Za-z0-9]` (`generateStreamKey`, stored with the `encrypted` cast); `desired_state` = `stopped`. (The model no longer sets jingle defaults; the four `jingle_*` columns keep their column defaults and are unused.)
- `container_index` = `max(container_index, including trashed) + 1`, never recycled (unique).
- After create, a default playlist is created (`Playlist::DEFAULT_NAME`, `is_default`, sequential, position 0).
- **Nothing starts.** A new station has no container and is `state: "offline"` until the owner presses Start AutoDJ or Go live.

Client (`StationForm`): success shows "Station created — ready to go live?" and `router.push` to the new slug. See form details below.

### Edit

`PUT /stations/{slug}` (`update`): `authorize('update')` (owner only, 403 otherwise), then `station->update($validated)`. `UpdateStationRequest::authorize()` returns `true`; ownership is the controller's job. The request rules are the full settings-form contract; the table below lists every field this endpoint accepts, including ones no dashboard form sends.

| Field | Rule | Sent by | Notes |
|---|---|---|---|
| `name` | `sometimes`, string, max 100 | Station form | `sometimes` plus not nullable: an explicit null is a 422. Restarts a running container. |
| `description` | nullable string | Station form | No length cap; the column is `text`. Restarts a running container. |
| `genre` | nullable string, max 255 | Station form | Restarts a running container. |
| `artwork_url` | nullable string, `url:http,https`, max 2048 | Station form (after an upload) | Any http(s) URL is accepted, not only ones we uploaded. Restarts a running container. |
| `timezone` | nullable, `timezone:all` | Nothing in the web or mobile apps (both send the zone in `PUT /stations/{slug}/schedules`, [Schedule](schedule.md)) | IANA name only. Clearing to null is a 422 while any show time (`schedules()`) or AutoDJ slot (`autodjSlots()`) exists (`withValidator` after-hook, two separate messages). Column `varchar(64)`. |
| `social_links` | nullable array, max 8 (`Station::MAX_SOCIAL_LINKS`); each element `array:label,url` (extra keys rejected); `url` required string `url:http,https` max 2048; `label` nullable string max 30 | `LinksCard` | Full-list replace; stored as JSON. |
| `theme_config` | nullable array | nothing | **Dead.** Validated, stored and returned, read by no client code. |

Jingle settings are no longer station fields: they are per-list rules on `jingle_lists` (`/stations/{slug}/jingle-lists`, [Library and playlists](library-and-playlists.md)), and `jingle_*` keys in this payload are dropped by `validated()`. `slug` in a payload is ignored. Admin-owned columns (`featured`, `featured_at`, `stream_key`, `desired_state`...) are not in the rules, so `validated()` never carries them. The model uses `$guarded = []`, so anything that bypasses the FormRequest (admin code, factories, tinker) can write any column.

Observer effects on update (`StationObserver::updated`): if any of `name, slug, description, genre, icecast_mount, icecast_password, artwork_url` changed and the station is running, `supervisor->up()` restarts it (`safely()`: a Docker failure is logged, not thrown, and `stations:reconcile` later converges). A stopped station just picks the change up at next start. Slug-change branches (stop old container, rename the playlist directory) exist but are unreachable through the API today because the slug is immutable.

Audit: `LogsActivity` on `Station` logs only `name, slug, description, genre, featured, desired_state`, dirty only. Artwork, timezone and social links are not in the activity log.

### The create/edit form (`station-form/StationForm.tsx`)

One form for both jobs. With no `station` it creates (rendered right on `/dashboard`); with one it edits (inside `StationFormDialog`, title "Edit station", which mounts the form only while open, so a cancelled edit doesn't reappear next time). Opened from Station settings → Profile → Edit, the overview header (artwork or "Edit profile") and the checklist.

| Field | Control | Client | Server |
|---|---|---|---|
| Artwork | `ArtworkDrop`: a dashed drop zone; drop an image or click the tile (or "Choose", hidden below `sm`); preview + Remove once set | `artworkProblem` refuses anything but PNG/JPEG/WebP and over 5 MB before uploading (toast) | Upload: jpg, jpeg, png, webp, gif, max 5120 KB (`UploadRequest`), `throttle:uploads` |
| Name | ds `TextField`, required, `maxLength=100`, autofocus when creating | Create/Save disabled until there is a name | required, max 100 |
| Genre | `TextField`, `maxLength=255` | | max 255 |
| Description | `TextAreaField` | | no limit |
| Link | Edit only: "{host}/station/{slug} · the link never changes" (host from `NEXT_PUBLIC_APP_URL`) | | slug immutable |

Server validation errors land on their fields (`errors.name/genre/description`). Artwork: choosing a file shows a local object-URL preview (revoked when replaced) and `POST /upload/images`; the response `data.url` becomes `artwork_url`; an upload failure toasts and restores the previous artwork. Submit sends trimmed values, empty strings as `null`. Create: toast "Station created — ready to go live?" and `router.push` to the new station. Edit: "Station updated", close, `router.refresh()`. Any 403 toasts "Each account has one station, and yours already exists."; other errors toast the server message or "Something went wrong. Nothing was saved." Covered by `StationForm.test.tsx`.

### Delete

Station settings, last row (`settings/DeleteStation.tsx`): "Delete this station" with a quiet **Delete station…** button, which opens a `ConfirmDialog` (`tone="danger"`, error red): "Delete {name}?", "This is permanent and can't be undone.", consequences (takes it off air straight away; breaks its player page, stream links and embeds; removes its library, schedule and show history), and the station's **slug** typed to enable "Delete forever" (cancel reads "Keep station"; locked while the request runs). `DELETE /stations/{slug}`; success toast "Station deleted", `router.push("/dashboard")` + `refresh` (lands on the create page); failure toast "Couldn't delete the station. Nothing was removed."

API (`destroy`): `authorize('delete')` (owner), `$station->delete()` (soft), JSON `{ message: "Station deleted." }`. Effects:
- `StationObserver::deleting` runs `supervisor->down($station)` (container stops; failures are swallowed to the log).
- `desired_state` is **not** cleared and no open `StreamSession` is closed, and the endpoint does not check whether a broadcast is in progress. A trashed station drops out of `Station::running()` (soft-delete scope), so the reconciler ignores it.
- The row disappears from `/stations`, and route binding 404s on its slug.
- `StationObserver::restored` would bring it back to whatever state it was in, but nothing in the app calls `restore()` (verified by grep of `api/app`); a restore is a manual database or tinker act.

Pruning: `stations:prune-deleted` (`PruneDeletedStations`) runs daily at 04:40 (`routes/console.php`, `withoutOverlapping`, `runInBackground`). It selects `onlyTrashed()` rows with `deleted_at` older than `config('liquidsoap.deleted_station_retention_days')` (`LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS`, default 30; `<= 0` disables pruning), and force-deletes them **one at a time** so `StationObserver::forceDeleted` fires (wipes the playlist tree on disk and, through the supervisor, the rendered `.liq` and HLS artifacts; `tracks` rows go by FK cascade). Options `--days=` and `--dry-run`. A failure is reported and retried the next day. **Uploaded artwork files** (`storage/uploads/images`) are never deleted by this or by an artwork replace.

Account deletion (`/dashboard/settings`) soft-deletes each of the user's stations through the same observer (`UserObserver::deleting`, individually so events fire); force-deleting a user force-deletes their stations.

## Station settings page

`stations/[slug]/settings/page.tsx`, server component, one `GET /stations/{slug}` (which loads `streamSessions, schedules, autodjSlots.playlist, defaultPlaylist` and opts into the `encoder` block). Title "Station settings"; two columns from `xl`, one below. Left: what listeners see. Right: how audio gets out and in, and delete.

1. **Profile** (`ProfileCard`): artwork, name, genre tag, description (placeholder "No description yet. Two lines telling listeners what you play.") and **Edit** (`StationFormDialog`).
2. **Links on your player page** (`LinksCard`, `#links`): see below.
3. **When you're usually live** (`ShowTimesSection`, `#show-times`): the station timezone (`TimezoneCombobox`) and the show-times editor. Rules in [Schedule](schedule.md); wiring below.
4. **Where listeners find you** (`StreamCard`): **Player page** (`{appUrl}/station/{slug}`, `CopyField`), **Direct stream** (`{NEXT_PUBLIC_ICECAST_URL}{icecast_mount}`, with the app URL in front when the Icecast URL is a same-origin path such as `/stream-proxy`; "Works only while you're on air"), **Quality** (the literal `MP3 · 128 kbps · 44.1 kHz`, hand-synced with `station.blade.php`).
5. **Use your own DJ software** (`EncoderSection` → `EncoderCard`): a folded card `Disclosure`, closed by default. Locked (`useEncoderLocked`): a PRO tag in the title; opened, one paragraph and **Request Pro**. Plan allows but `station.encoder` absent (no ingest router): "Own-software broadcasting isn't available on this server yet." Available: the Icecast 2 instruction, `EncoderConnection` (Server, Port, Mount, Username, Password rows shown in full (wrapped, not truncated), each with Copy through `lib/clipboard.ts` `copyText`, failure toast "Couldn't copy — select the value and copy it manually"; the password masked with Show/Hide; "Where these go in BUTT, Mixxx and ffmpeg" folded underneath), **New key** (`POST /stations/{slug}/stream-key` after a confirm; the new key shows and is revealed at once, until the refreshed prop's `rotated_at` catches up), four folded questions (turn the station on first; Shoutcast doesn't work; a new key doesn't kick anyone off; the connection isn't encrypted) and a link to `/help/my-encoder-wont-connect`. There is no `#encoder` anchor any more. Full behaviour: [Encoder ingest](encoder-ingest.md).
6. **Delete this station** (`DeleteStation`): a quiet row with "Delete station…" (below).

### `LinksCard` in detail

A list of saved links (site icon, name, the address without its scheme, **Remove**) and one address field with **Add** (or Enter). Both save at once: `PUT /stations/{slug}` with the whole `social_links` array, toast "Link added" / "Link removed", `router.refresh()`. There is no name field and no Save button; names saved by the old editor are kept, because every save sends the list back as it was. New links are sent with `label: null`.

- `normalizeSocialUrl` prepends `https://` when there is no scheme.
- Refused before the request: anything `resolveSocialLink` can't parse ("… doesn't look like a web address."), and a URL already in the list ("That link is already on your player page.").
- Max 8 (`MAX_SOCIAL_LINKS`): at 8 the field is replaced by "8 links is the most a player page shows. Remove one to add another."
- `resolveSocialLink` refuses a host that isn't dot-separated labels of letters, digits, `-` and `_` (Chromium percent-encodes spaces into the host of "https://not a url", which the API's `url` rule would refuse), then matches the host (leading `www.` stripped, walking up subdomains) against the `PLATFORMS` table in `lib/socialLinks.ts` for an icon and name; anything else gets a globe and its hostname.
- A 422 toasts the first server message. Order is the array order, which is what the player page shows.

### `ShowTimesSection` wiring

Holds the station timezone (`chosen`, or the browser's zone when the station has none, read after mount) and the rows. `ShowTimesEditor` (rows on inset wells: name `Input`, start time `Input type="time"`, remove; days as a neutral off-white `DayToggle` with `stretch`, Monday first and mapped to the stored Sunday-first days through `WEEK_ORDER`; `ShowTimesEditor.test.tsx`) saves both in one `PUT /stations/{slug}/schedules` with `{ timezone, schedules }`, so this is the only place the timezone is sent from. "Unsaved changes" shows next to Save, and leaving warns (`beforeunload`) when either is dirty. A null station timezone shown as the browser zone is not counted as a change. `TimezoneCombobox` (moved into `settings/`): options from `Intl.supportedValuesOf("timeZone")`, typeahead treating spaces as underscores, at most 50 matches each with a "GMT+N" hint, keyboard and ARIA combobox roles. See [Schedule](schedule.md).

## Account page (`/dashboard/settings`)

A client component that reads the `user` cookie after mount (`useMounted` + `getUser()`; a skeleton until then) and holds the newer copy a form saves. One column (`max-w-3xl`), title "Account". Components in `components/dashboard/account/`:

- **`PlanCard`** (nothing while the plan is unknown). Pro (`plan.slug !== "free"`): amber card, PRO tag, "You're on {name}", and what the plan includes, built from its own flags by `planIncludes` (listeners cap, AutoDJ, embeds, your own DJ software, N days of audience history; `PlanCard.test.ts`), plus "Ends {date}, then your account moves to Free." when `expires_at` is set (a time-limited invite). There is no billing button (no billing exists). Free: a plain card with the same list, "Your station plays only while you're live." and **Request Pro**.
- **`ProfileForm`**: Name and Email (`TextField`). "Save changes" is disabled until something changed. Changing the email reveals "Current password" (`PasswordField`; required client-side, server error shown on the field). Sends `PATCH /account/profile` with only changed fields; on success the cookie user is refreshed (`saveAuth`) and, if the new address is unverified, the dashboard's `account/VerifyEmailDialog` opens (ds kit; the flow is `hooks/useEmailVerification.ts`, shared with the login/register dialog; it closes only through its own buttons or a verified code).
- **`PasswordForm`**: "Password" (current + new) or "Set a password" for Google-only accounts (`has_password === false`, new only). One new-password field with Show/Hide (`PasswordField`), no confirm field: the API's `confirmed` rule is sent the same value. Button disabled until the new password has 8 characters (and the current one is filled). `PATCH /account/password`; "Changing it signs you out everywhere else."
- **`DeleteAccount`**: a quiet row, "Delete account…", opening a `ConfirmDialog` (`tone="danger"`): "Delete your account?", three consequences, the account email typed to enable "Delete forever" (`DELETE /account` with `{ confirmation }`, then `clearAuth()`, toast, `router.push("/")`). The dialog says "permanent"; in fact stations are soft-deleted (30 days) and the account row is soft-deleted with its email scrambled.

The API side of these endpoints is in [Auth](auth.md) and [Accounts, plans, invites](accounts-plans-invites.md). The routes sit **outside** the `verified` group on purpose, so an unverified user can fix a mistyped email or delete the account.

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
| `autodj_queued_starts_at`, `autodj_queued_seconds`, `autodj_queued_is_jingle` | timestamp(3) null, double null, bool default false | immutable_datetime, float, boolean | AutoDJ clock, written by `AutoDjScheduler` with the query builder ([AutoDJ](autodj.md)) |
| `jingles_enabled`, `jingle_mode`, `jingle_interval_seconds`, `jingle_every_tracks` | bool false, varchar(16) interval, uint 1800, uint 5 | none | **Unused** since jingle lists (2026-10-05); copied into each station's first list by the migration, to be dropped in a follow-up |
| `social_links` | json null | array | |
| `theme_config` | json null | array | Unused |
| `featured`, `featured_at` | bool default false indexed, timestamp null indexed | boolean, datetime | Admin-only, via `markFeatured()` |
| `created_at`, `updated_at`, `deleted_at` | timestamps | | |

`is_live` is **not** a column: it is derived from an open `stream_sessions` row (`Station::isLive`, `scopeLive`). Relations: `user`, `streamSessions`, `events`, `listenerStats`, `tracks`, `musicTracks`, `jingles`, `playlists`, `defaultPlaylist`, `autodjSlots`, `jingleLists`, `schedules`, `notifySubscriptions`. Constants: `MAX_SOCIAL_LINKS = 8`, `FEATURED_RAIL_SIZE = 4`. Scopes `running`, `live`, `featured`, `indexable`, `withIndexability`.

### Limits per plan

`plans.max_stations` (Free 1, Pro 5) is read in exactly one place: `StoreStationRequest::authorize`. `plans.max_running_stations` (Free 1, Pro 5) is enforced by the start path ([Station lifecycle](station-lifecycle.md)). Other plan columns that shape this dashboard reach the client through `UserResource.plan` (`GET /user`): `slug, name, autodj_enabled, analytics_days, max_listeners, embed_enabled, encoder_enabled, watermarked, expires_at`. The client deliberately does not receive `max_stations`. Current caps set by migration `2026_09_02_100000_raise_plan_listener_caps.php`: Free 100 listeners, Pro 1000, shown only as text on the Account and plan cards. `watermarked` is sent and typed but must not be rendered (built, never enabled; see `client/interfaces/Plan.ts` and `Station.ts`).

## API surface used by this dashboard

| Method and path | Controller | Auth | Purpose |
|---|---|---|---|
| `GET /stations` | `StationController::index` | sanctum, verified | The account's non-deleted stations, **unordered**, no pagination; no `encoder`, `schedules`, `stats`. Used by `getMyStation` and the mobile home. |
| `POST /stations` | `store` | + plan limit | Create (201) |
| `GET /stations/{slug}` | `show` | owner (`view`) | Loads `streamSessions` (all rows, to compute stats), `schedules`, `autodjSlots.playlist`, `defaultPlaylist`; adds `encoder`, `programme`, `stats` |
| `PUT /stations/{slug}` (also PATCH) | `update` | owner | Profile, links, timezone |
| `DELETE /stations/{slug}` | `destroy` | owner | Soft delete |
| `GET /stations/{slug}/sessions` | `StreamSessionController::index` | owner | `latest('started_at')->paginate(20)`; `?finished=1` leaves out the open session. Paginator JSON (top-level `data`, `total`, `current_page`, `last_page`) plus `summary: { shows, live_seconds }` over **every** finished session. Used by the Overview, Your shows and the mobile station screen |
| `POST /stations/{slug}/sessions`, `DELETE /stations/{slug}/sessions/{id}` | `store`, `destroy` | owner (`update`) | Routed but **called by nothing in the web client or mobile app** (reserved for a desktop client): `store` refuses with 409 `station_already_live` when another device or an encoder session holds the mount and dispatches the live notification after 2 minutes; `destroy` ends the session and clears `metadata:{id}` |
| `POST /upload/{type}` (`images` or `sounds`) | `UploadController` | sanctum, verified, `throttle:uploads` (20/min per user, `AppServiceProvider`) | Artwork file to `storage/uploads/images`, returns `data.url`. `sounds` (mp3/wav/ogg/flac/aac, 50 MB) is the same endpoint; the dashboard only uses `images` |
| `GET /stations/{slug}/status`, `POST .../start`, `.../stop` | other controllers | owner | [Station lifecycle](station-lifecycle.md) |
| `GET /user` | `AuthController::user` | sanctum | Plan and entitlements |
| `PATCH /account/profile`, `PATCH /account/password`, `DELETE /account` | `AccountController` | sanctum, **not** verified-gated | Account page |

`StationPolicy`: `view/update/delete` are `user->id === station->user_id`; `viewAny/create` are `true` and unused (the limit lives in the FormRequest). Non-owner access is a 403, which the client presents as not-found.

### `StationResource` fields (what the client receives)

Always: `id, user_id, name, slug, description, genre, timezone, artwork_url, featured, is_live, is_on_air, desired_state, started_at, state, now_playing, icecast_mount, hls_url, social_links, theme_config, created_at, updated_at`. Conditional: `indexable` (only when the public show endpoint loaded `withIndexability`); `watermarked` (owner only); `encoder` (owner, plan, deployed, and `withEncoder()`); `schedules` (when loaded); `autodj_slots` and `programme` (when `autodjSlots` loaded, which is `show()` and the slot save); `stats` (only when `streamSessions` is loaded, i.e. `show()`).

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
| `StreamSession.ts` | session rows | `source_type` `browser | electron | external`; `electron` is reserved, nothing writes it. `peak_at` (when the peak was first reached) |
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
| Help | `HelpLink` (sparingly, always a new tab): `/help/turning-your-station-on-and-off` by the hero's state label, and beside page titles such as Audience. |

## Gaps and traps

1. **One station per account is a client convention.** The API allows `max_stations` (Free 1, Pro 5). A Pro user creating a second station via API gets it silently ignored by the dashboard, which resolves the oldest. The form's 403 text "Each account has one station, and yours already exists." is therefore only accurate for Free.
2. **Editing name, genre, description or artwork restarts a running station** and drops listeners; the form gives no warning. Only timezone and links are restart-free (jingle rules are not station fields and never touch the container).
3. **The form's 403 message is wrong in edit mode.** Any 403 (for example the `email_unverified` middleware response) toasts "Each account has one station...". The axios interceptor also toasts "Verify your email to continue." for that code.
4. **Artwork: GIF is accepted by the server but refused by the client** (`ARTWORK_TYPES` is PNG/JPEG/WebP). Both cap at 5 MB.
5. **`artwork_url` accepts any http(s) URL** and the column is `varchar(255)` while the rule allows 2048 (a long URL 500s at the database). `next.config.ts` `images.remotePatterns` allows only `https://{host of NEXT_PUBLIC_API_URL, else api.gocast.fm}/storage/**`, `https://lh3.googleusercontent.com/**` and `http://localhost:8000/storage/**`, so an arbitrary external artwork URL fails in the Next image optimizer (in development images are `unoptimized`, so the problem only appears in a production build).
6. **Uploaded artwork is never deleted**, on replace, on station delete or by the prune.
7. **`description` has no length limit** at the API or in the form.
8. **Delete copy vs behaviour.** The dialog says "This is permanent and can't be undone"; in reality the rows and audio survive 30 days (`stations:prune-deleted`) and restore is possible by hand. `desired_state` is not reset, so a restored running station comes straight back on air. Delete does not check for a live broadcast or close its open `StreamSession`. Artwork files stay forever.
9. **`/dashboard/station/{path}` allowlist omits `schedule`** (and anything nested; `STATION_PAGES = studio, live, library, audience, settings`). A link to `/dashboard/station/schedule` lands on the Overview.
10. **Layout trusts the `user` cookie**: a malformed cookie throws instead of redirecting; `email_verified_at` and identity come from the cookie, not `/user`.
11. **`state` on the page payload is intent-only.** The band, sidebar lamp and hero wait for the poll ("CHECKING"), but server-rendered uses of `station.state` (the header's "Last live", the Coming up and Account pages) are intent-based.
12. **The 14-day comparison disappears for established stations.** `LiveShowsCard` gets `truncated = total > 20`, so once a station has more than 20 lifetime sessions the "vs the 14 days before" line is always suppressed, and the 14-day counts are limited to what fits in the newest 20.
13. **Days differ between cards.** `LiveShowsCard` buckets by the viewer's local day; Recent shows, Your shows and the top bar use the station's timezone.
14. **`show()` loads every stream session** for `stats`; cost grows with broadcast history.
15. **Hand-synced strings**: the stream quality in `StreamCard` (`MP3 · 128 kbps · 44.1 kHz`) must match `station.blade.php`. If `NEXT_PUBLIC_APP_URL` is unset the player link is relative.
16. **`theme_config` and `watermarked` are dead** (validated/stored/sent, rendered nowhere). Do not build on them.
17. **Slug is immutable**, so a renamed station keeps its old URL forever; the observer's slug-change code is unreachable through the API.
18. **Plan data is per layout render.** After a Pro grant, the sidebar and locks only change on the next full dashboard render (`router.refresh()` or reload); `ProRequestContext.requested` is not persisted.
19. **No deep link opens the DJ-software fold.** The old `#encoder` anchor is gone; the card opens closed.
20. **`timezone` on `PUT /stations/{slug}` has no sender.** Both apps set the zone through `PUT .../schedules`, so the `UpdateStationRequest` timezone-clear guard is only reachable by direct API calls.
21. **`POST`/`DELETE /stations/{slug}/sessions` are unused** by web and mobile. `destroy` authorises on the station but does not check that the session belongs to it (no `scoped()` on the nested route).
22. **`/dashboard/broadcasts` masks every failure as 404** (`catch { notFound() }`), including 5xx and timeouts.
23. **Links save on every Add/Remove** with the whole list; two tabs editing links at once overwrite each other.

## Tests

- `api/tests/Feature/Models/StationSlugTest.php`: slug generation, collision suffixes, emoji fallback, soft-deleted collision, immutability, create via API.
- `api/tests/Feature/Models/StationSoftDeleteTest.php`, `UserSoftDeleteTest.php`: soft delete and cascade from user.
- `api/tests/Feature/PruneDeletedStationsTest.php`: window, `--days`, disabled retention, `--dry-run`, deleted accounts.
- `api/tests/Feature/StationSocialLinksTest.php`: order, clear, protocol allowlist, required url, unknown keys, max 8, label length, public visibility, cross-owner block.
- `api/tests/Feature/StationObserverTest.php`, `StationEncoderResourceTest.php`, `StreamKeyRotationTest.php`, `StationStatsTest.php`, `StationPowerControllerTest.php` (creates a station off air), `Auth/EmailVerificationEnforcementTest.php` (station routes need a verified email).
- `DerivedStationStateTest.php` (the intent-derived `state`/`is_live`/`is_on_air` vs `/status`), `StationContainerIndexTest.php` (index allocation, never reissued), `StationHlsUrlTest.php` (`hls_url`).
- `api/tests/Feature/StreamSessionIndexTest.php`: the sessions summary over every finished show, `?finished=1`, paging, owner only.
- Client unit tests (Vitest, `npm test`): `lib/airState`, `lib/stationHero`, `lib/comingUp`, `lib/liveShows`, `lib/showsTrend`, `lib/dashboardNav`, `lib/format`, `lib/socialLinks` (`resolveSocialLink`, including the host check), `components/ds/*.test.tsx`, `ConfirmDialog.test.tsx`, `StationForm.test.tsx`, `ShowTimesEditor.test.tsx`, `account/PlanCard.test.ts`.
- `client/tests/e2e/dashboard-visual.spec.ts` (`npm run test:visual`): every page and main state at desktop and phone width ([Dev environment and testing](dev-environment-and-testing.md)).
- No test found for `StoreStationRequest` plan-limit rejection or for `UpdateStationRequest` timezone-clear guard beyond the schedule tests in `StationScheduleTest.php` ([Schedule](schedule.md)).

## History

- Plans and handoffs (history only, not spec): `docs/AUTODJ-SCHEDULING-HANDOFF.md`, `docs/MOBILE-APP-HANDOFF.md`. Related feature docs: [Schedule](schedule.md), [Station lifecycle](station-lifecycle.md).
