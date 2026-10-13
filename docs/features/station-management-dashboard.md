---
feature: Station management dashboard (shell, overview, station CRUD, settings)
verified: 2026-10-09 against 4b02335 plus uncommitted work (feat/dashboard-design: the create page)
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
  - client/components/dashboard/overview/ShowsLinks.tsx
  - client/components/dashboard/shell/SetupMenu.tsx
  - client/lib/setupItems.ts
  - client/app/dashboard/stations/[slug]/playlists/page.tsx
  - client/components/dashboard/share/TuneInCodeDialog.tsx
  - client/components/dashboard/share/ShareDialog.tsx
  - client/components/dashboard/shows/ShowsList.tsx
  - client/components/dashboard/station-form/StationForm.tsx
  - client/components/dashboard/station-form/CreateStation.tsx
  - client/components/dashboard/station-form/ArtworkDrop.tsx
  - api/app/Http/Controllers/StationSlugController.php
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
fingerprint: 810f2016894417bc
---

# Station management dashboard

The signed-in web shell for one broadcaster: the sidebar, top bar, status band and phone tab bar, the station Overview, Your shows, station create/edit/delete, and the Station settings and Account pages. Everything is drawn with the dashboard design system (`components/ds/`, tokens in `client/app/dashboard.css`); `components/ui` is the marketing kit and only five of its primitives (skeleton, sidebar, slider, scroll-area, avatar) are used here, enforced by lint (see [Dev environment and testing](dev-environment-and-testing.md)). **A user has one station.** The client enforces that by always resolving "the" station as the oldest one the account owns (`client/lib/station-server.ts` `getMyStation`). The API does **not** enforce it: the plan row still allows one station on Free and five on Pro (`plans.max_stations`, created in `2026_04_16_131050_create_plans_table.php`, never lowered by a later migration). The UI hides that, so a second station made by API is invisible in the dashboard.

Other things that surprise people:

- **Editing the station profile on a running station restarts its Liquidsoap container**, or, if someone is live, restarts it right after the show (the reconciler's Outdated pass). `name`, `slug`, `description` and `genre` are in `StationObserver::LIQ_RELEVANT_COLUMNS`, so a changed value re-renders the `.liq` and calls `supervisor->up()`, which "always re-renders the .liq and restarts the container ... a restart drops connected listeners" (`LiquidsoapSupervisor::up` docblock). Artwork, show times, timezone, social links, `theme_config` are not in that list and never restart anything.
- **"Delete station" is a soft delete.** The container comes down at once; the row, audio and history stay for 30 days and are then erased by `stations:prune-deleted`. The dialog says "This can't be undone", and in the product that is true (no restore UI or endpoint exists), but the data is not gone for a month.
- **The station has two "states"** with different sources of truth: the server-rendered pages carry the cheap intent-derived `state`, while the status band, sidebar lamp and overview hero read the shared `/stations/{slug}/status` poll and paint the real one. See the shell and Overview below.

Everything about going on and off air, the studio, the library, the schedule and the audience is owned elsewhere: [Station lifecycle](station-lifecycle.md), [Web studio](broadcasting-web-studio.md), [Library and playlists](library-and-playlists.md), [AutoDJ](autodj.md), [Schedule](schedule.md), [Listener analytics](listener-analytics.md), [Encoder ingest](encoder-ingest.md), [Public player and embed](public-player-and-embed.md), [Accounts, plans, invites](accounts-plans-invites.md), [Auth](auth.md). This doc covers their entry points into the shell and what the shell itself does.

## Route map

All under `client/app/dashboard/`. Every route is inside `layout.tsx` and `error.tsx`.

| URL | File | What it is |
|---|---|---|
| `/dashboard` | `page.tsx` | Resolves the station. Has one: `redirect` to `/dashboard/stations/{slug}`. Has none: the create page (`CreateStation`, "Let’s set up your station."). A failed `/stations` fetch throws to `error.tsx`. |
| `/dashboard/stations` | `stations/page.tsx` | Dead URL kept for old bookmarks. Always `redirect("/dashboard")`. |
| `/dashboard/library` | `library/page.tsx` | Forwarder. Station: redirect to `.../library`; none: `/dashboard`. Exists only because the sidebar's slugless AutoDJ fallback points here. |
| `/dashboard/station/{...path}` | `station/[[...path]]/page.tsx` | Slug-free deep link (singular "station"). Looks up the viewer's own station and redirects. Allowlist `STATION_PAGES = studio, live, library, audience, settings`; anything else (including `schedule`, multi-segment paths and typos) lands on the station Overview. No station: `/dashboard`. Built for announcement buttons (one payload for every account). |
| `/dashboard/stations/{slug}` | `stations/[slug]/(overview)/page.tsx` | The Overview (below). |
| `/dashboard/stations/{slug}/settings` | `.../settings/page.tsx` | Station settings (below). Anchors `#links` and `#show-times` are deep-linked from the top bar's setup menu and elsewhere. |
| `/dashboard/stations/{slug}/live`, `/studio`, `/studio/wrap` | own docs | Go live, the studio and "That's a wrap". The sidebar's Studio item and the band link here. |
| `.../library`, `.../playlists`, `.../schedule`, `.../audience` | own docs | Library, Playlists, Schedule, Audience. Library and Playlists are the two AutoDJ pages ([Library and playlists](library-and-playlists.md)). |
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
4. Renders providers outermost to innermost: `RealtimeProvider(userId)` > `BroadcastProvider` > `AccountProvider` > `StationProvider` > `ProRequestProvider` (inside StationProvider since 2026-10-09: `open()` toasts "Create your station first, then tell us about it to request Pro." and does not open the dialog while there is no station) > `StationStatusProvider` > `SidebarProvider data-surface="dashboard"`, then `AppSidebar` and `DashboardShell` (`components/dashboard/shell/`), which holds the sticky chrome (`TopBar` over `StationBand`), the page body (`px-gutter`, capped at `max-w-page`) and the phone `TabBar`.
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

One list, `NAV_ITEMS`, drives the sidebar, the phone tab bar and the top bar's breadcrumb. Each item has a slugless fallback `href` and, once a station is resolved, a `stationHref`. Three items carry `group: "autodj"`: **AutoDJ is a heading, not a page** (`AUTODJ_GROUP`, label "AutoDJ", lock AutoDJ); the heading opens its first section, and the plan lock and the on-air lamp are the heading's, not the children's.

| Item | With station | Fallback | Lock |
|---|---|---|---|
| Overview | `/dashboard/stations/{slug}` | `/dashboard` | |
| Studio | `.../live` (the **broadcasting** station's `.../studio` while this tab broadcasts) | `/dashboard` | |
| AutoDJ › Library | `.../library` | `/dashboard/library` | (group) AutoDJ |
| AutoDJ › Playlists | `.../playlists` | `/dashboard` | (group) AutoDJ |
| AutoDJ › Schedule | `.../schedule` (AutoDJ slots only; show times are in Station settings) | `/dashboard` | (group) AutoDJ |
| Audience | `.../audience` | `/dashboard` | Audience |
| Your shows | `/dashboard/broadcasts` | same | |
| Settings (station) | `.../settings` | `/dashboard` | |

`activeNav(pathname)` maps `/dashboard` and a bare station path to Overview, `/dashboard/library` to Library, `/dashboard/broadcasts` to Your shows, and the station sub-segment through `SEGMENT_TO_KEY` (`live`/`studio` Studio, `library`, `playlists`, `schedule`, `audience`, `settings`); anything else is null (no item lit). `inAutoDj(key)` says whether a key is one of the three AutoDJ sections (`AUTODJ_ITEMS`). `pageLabel` gives the breadcrumb's page name: null on the overview, "Account" for `/dashboard/settings`, "Design system" for the gallery, else the item's label. Covered by `lib/dashboardNav.test.ts`.

### Sidebar (`AppSidebar.tsx`)

Header: the wordmark "GoCast.fm" (to `/dashboard`) and, with a station, a station card (artwork, name, and a `StatusLamp` with the band's coarse state from `airState`). Items: the table above; the AutoDJ group is drawn as one `role="group"` block, the heading link in the row style with the three sections indented under it (a rule down their left edge, a step smaller). A locked item stays clickable and carries an amber **Pro** tag. Studio shows a pulsing red "Live" lamp while this tab broadcasts or the band's tone is live/mic; the AutoDJ heading shows a violet "On" lamp while the band's tone is `onair`. Below 1024 px (`useIsMobile(1024)`, matching the sidebar's `lg:` classes) the sidebar is a drawer, closed on every route change.

Footer:
- **Plan card**, only when `useAutoDjLocked` (Free, plan known): "{plan name} plan", an amber "Request Pro" button (becomes "Requested"), and "Your station goes silent when you stop broadcasting." (after a request: "Request sent — we'll be in touch.").
- **Account menu** (avatar, name, email; a PRO tag when a plan is known and AutoDJ isn't locked). Menu: "Account and plan" (`/dashboard/settings`), Help (`/help`, new tab), Sign out. Signing out while broadcasting first asks "Sign out and end your broadcast?" (Stay signed in / End and sign out).

### Top bar (`shell/TopBar.tsx`)

Sidebar toggle, a breadcrumb "{station name} › {page}" (the station name links to the overview), the **station clock** ("THU 14:37 · LONDON", `formatStationClock` in the station's timezone, rendered after mount, re-read each minute, hidden below `sm`, absent when the station has no timezone), the **setup chip** (`shell/SetupMenu.tsx`, below) and **Updates** (`shell/UpdatesMenu.tsx`, the notification popover; [Notifications](notifications-and-email.md)).

### Setup menu (`shell/SetupMenu.tsx`, `lib/setupItems.ts`)

What the station still needs, as a chip in the top bar: a progress ring and "{done} of {total} set up" ("{done}/{total}" below `sm`), opening a panel headed "{One thing|Two things|…} left to set up" with a `SegmentBar`, "{done} OF {total}" and one `ActionRow` per missing item. It replaced the overview's setup card so the overview fits on one screen. Gone once everything is done. On phones (`useIsMobile(640)`) the panel is the ds bottom sheet (`ds/Dialog`, "Each one goes straight to where it's done."), not a popover.

The items (`setupItems`, in the order the work runs): Add station artwork and Write a description (both open `StationFormDialog`, a sibling of the panel so the two Radix layers don't fight over focus), Fill AutoDJ's playlist (`.../library`; omitted when AutoDJ is locked), Set your show times (`.../settings#show-times`), Add your social links (`.../settings#links`), Get your first listener (`stats.has_listeners`, else `peak_listeners > 0`; no action). The menu fetches its own `GET /stations/{slug}` and `/stations/{slug}/playlists` (the layout's station context is identity only and goes stale the moment artwork is saved): the default playlist's `track_count` feeds the AutoDJ item, and a failed playlists read counts as filled so it never nags about a playlist it couldn't see. It re-reads on every route change, when the panel opens and when the edit dialog closes. There is no "hide" any more: the chip stays until the items are done.

### Status band (`shell/StationBand.tsx`)

Under the top bar on every page while a station exists. What it says comes from `airState` (`lib/airState.ts`, pure, `airState.test.ts`), which ranks this tab's own broadcast above the poll:

| Band (label) | When | Action |
|---|---|---|
| LIVE / LIVE · MIC / fault label (amber) | This tab is live or reconnecting; tone and sentence from the studio signal | Close mic (mic latched), else Open studio (not on the studio page) |
| SHOW ENDED | This tab's show just ended and the station is still handing over (`showEnding`): "Your show has ended. Checking what’s on air now…" | none |
| CHECKING | No status yet, first read in flight | none |
| NO ANSWER | No status after the read, or `!reachable` | none |
| OFF AIR | `state === "offline"`: "Nothing's playing. Nobody can tune in right now." | Start AutoDJ, or Go live when AutoDJ is locked |
| STARTING | `starting` | none |
| NOT HEARD (amber) | `degraded`: "Your station is running, but listeners can't hear it right now." | none |
| LIVE | A broadcaster from elsewhere (`broadcaster === true`, or null on an old container with a `live_source`): "You're live from your DJ software / from the GoCast app / from another browser." | none |
| NO ANSWER | the poll answered but `!reachable` | none |
| GOING LIVE | `source === "silence"` while this tab's broadcast is `ready` or `connecting` (the station was turned on for a show that hasn't started): "Your station is on and waiting for you. Listeners hear silence until you go live." | none |
| SILENCE (amber) | `source === "silence"` otherwise: "AutoDJ is on but has nothing to play. Listeners hear silence." | Add tracks |
| ON AIR · AUTODJ (violet) | otherwise: "AutoDJ is playing {title} by {artist}." (or just the title, or "AutoDJ is playing.") | Go live |

Button texts are `AIR_ACTION_LABEL`: Start AutoDJ, Go live, Open studio, Close mic, Add tracks.

While this tab broadcasts, the band also shows the show's uptime, the listener count, and (off the studio page) the title of the queue track the transport is steering plus play/pause and next-track buttons for the studio queue (the studio page shows its own deck). This replaced the old `LiveBanner` and `BroadcastMiniController`. A fault (amber) is also read out in full through an sr-only `role="alert"` line in `ds/StatusBand`.

### Phone tab bar (`shell/TabBar.tsx`)

Below 640 px, fixed to the bottom: Station, Studio, AutoDJ, Audience, and More (opens the sidebar drawer). AutoDJ opens Library and stays lit on all three AutoDJ sections (`inAutoDj`), which switch between themselves on the page; More is lit on any page outside the four tabs. Studio goes to the broadcasting studio while a show runs and shows a red dot. Not rendered without a station. It carries `data-slot="tab-bar"`, which `dashboard.css` uses below 40 rem to lift toasts above it (`--toast-offset-bottom: calc(4.5rem + env(safe-area-inset-bottom))`).

### Error boundary (`error.tsx`)

Sits inside the layout so the broadcast survives a page crash. Heading "This page didn't load". While live it says the broadcast is still on air and offers "Back to the studio" (the **broadcasting** station's studio); otherwise "Go to your station" (`/dashboard`). "Try again" calls `unstable_retry` (Next 16; re-fetches, unlike `reset`). A "Details for support" disclosure shows `error.message` and `digest`.

## Overview (`stations/[slug]/(overview)/page.tsx`)

Server component (tab title "Overview"). Fetches in parallel: `/stations/{slug}` (`show()`, so the payload carries `encoder`, `schedules`, `programme`, `stats`) and `/stations/{slug}/sessions` (newest 20, plus `total`). Both are fatal (404/403 become `notFound()`, a 401 goes to login). The page itself no longer reads playlists: the setup menu in the top bar does its own fetching.

Sections, top to bottom (`components/dashboard/overview/`):

1. **`OverviewHero`**: two panels on one surface whose fill is the state (plain off air, violet AutoDJ, red live, amber when listeners hear nothing). Left, first `OverviewHeader` (who the station is): the artwork is itself a button that opens the edit dialog (an "Add" caption when there is none), the name as the page `h1` with a genre `Tag`, and a meta line "Since {Mon YYYY}" plus "Last live {relative}" when the newest closed session exists and the station isn't live, with an **Edit profile** button (`StationFormDialog`). The description is not shown here (it is on the player page and in Edit profile), and there is no player-page button (the link lives on `YourLinkCard`). Then the state lamp with, when known, the source after it ("· AutoDJ", "· Live from Mixxx 2.5") and a `HelpLink` to `/help/turning-your-station-on-and-off` ("what each station status means"), a one-line title, a sentence, `NowPlayingWell` while AutoDJ plays (title · artist, time left and a progress bar drawn per animation frame from the last poll, what's next), and the controls. Right: `ListeningNow`, the public listener count (`useListenerCount`, counted up by `useCountUp`), with a line that changes with the state ("Your station is starting. Counting begins once it’s on air." while starting; off air "Go live to start counting." or, with AutoDJ, "Start AutoDJ or go live to start counting."; "Counting who’s tuned in…" before the first count; nobody listening: "Nobody right now. Your peak is N." when `stats.peak_listeners` > 0, else "Nobody yet. Share your link below."; listeners: "Tuned in to your show right now." while live, else "On your player page and the direct stream.") and "See your audience →". The decisions are `stationHero` (`lib/stationHero.ts`, `stationHero.test.ts`); power calls are `useStationPower`.
2. **`YourLinkCard`** and **`ComingUpCard`** side by side.
3. **`ShowsLinks`**: where the shows went. Two `ActionRow` tiles on a tall viewport (`min-height: 52rem`, a height query because no width tells a tablet from a laptop), otherwise one line of text: "Your live shows →" to Audience with "{airtime} in the last 14 days" (or "none in the last 14 days"), from `lib/liveShows.ts` bucketed by the **station's** day (`timeZone`, UTC without one; `truncated` = more sessions than the 20 loaded), and "Recent shows →" to `/dashboard/broadcasts` with "last {Tue 29 Sept}" on the station's clock, "on air now" while a session is open, or "none yet". The 14-day chart and the recent-shows list that used to sit here as full cards were what pushed the overview below the fold.

`loading.tsx` still draws the previous layout with skeletons (a separate header with the description, a hero, two cards, then two tall cards that no longer exist), so the page shifts when the data lands (animation off under `prefers-reduced-motion`).

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

Controls: **Go live now** (to `.../live`; disabled while running and the status is unknown) whenever nobody is live; **Open the studio** when live from this tab; **Hear your stream ↗** (player page) when live from elsewhere. When the page payload says `live` but the first poll hasn't answered and this tab isn't the broadcaster, no lead button is offered at all (which source holds the mount is unknown, and "Open the studio" would be wrong for every encoder show). Off air and not AutoDJ-locked adds **Start AutoDJ**; running (and not live from this or another browser) adds a stop button, "Stop AutoDJ" while AutoDJ plays (asks "Stop AutoDJ on {name}?", Keep playing / Stop AutoDJ) or "Turn station off". From an encoder the stop button stays, so the owner can cut off a leaked key: a stop refused with `code: "station_is_live_external"` opens "Cut off this broadcast?" and "Cut it off" re-sends stop with `{ force: true }`. Free stations get no Start AutoDJ (without AutoDJ an empty station emits silence and `stations:sweep` turns it off).

### `YourLinkCard`

"Your link": a `CopyField` that displays the bare player URL but copies `taggedStationUrl(appUrl, slug, "owner")` (`?utm_source=owner&utm_medium=share`). Buttons: **Tune-in code** (`share/TuneInCodeDialog`: a QR of the `qr`-tagged URL, 640 px canvas at level H with the logo excavated, violet `#4c1d95` modules on white, "Download PNG" as `{slug}-qr.png`), **Embed** (`EmbedDialog`, which puts focus on its Copy code button on open rather than in the preview iframe, where Esc would go to the player, and copies through `copyText`, toasting "Couldn't copy — select the code and copy it manually" when that fails; on a plan without embeds it opens the Pro request and carries a PRO tag) and **Share…** (`share/ShareDialog`: Copy link, WhatsApp, Email, X, and the system share sheet when `navigator.share` exists). Embed itself: [Public player and embed](public-player-and-embed.md).

### `ComingUpCard`

The next three things on the station (`lib/comingUp.ts`, `comingUp.test.ts`): each show time's next occurrence (yours, live) and AutoDJ's next slot change (`programme.next`, violet), in the station's timezone as "Today 21:00" / "Tomorrow 09:00" / "Fri 18:00". Rendered after mount (the clock). The header link goes to Show times when there are none, else to Schedule.

## Your shows (`/dashboard/broadcasts`)

Server component (`broadcasts/page.tsx`, tab title "Your shows"). Fetches `/stations/{slug}/sessions?finished=1` for the resolved station; **any** failure becomes `notFound()`. Empty (or no station): the page title, "Nothing here yet…" and a **Go live** button (or "Create your station").

Otherwise the header reads "{n} shows · {airtime} live in total." from the API's `summary` (every finished show, not just the page; only page 1 of the paginator carries it), followed by one trend sentence from `lib/showsTrend.ts` (`showsTrend.test.ts`): the latest ≤5 shows against the ≤5 before, only with at least 3 on each side and a change of 15% or more (a peak change must also be at least one listener), e.g. "Your recent shows run shorter but draw more listeners at their peak." Nothing is said about how long people stay; that isn't measured.

`components/dashboard/shows/ShowsList.tsx` draws the table: STARTED (weekday date, and the start–end time on the **station's** clock), FROM (Studio / Desktop app, or for an encoder the software's name when it sent one, else Own software; hidden on a phone), ON AIR (off-white bar scaled to the longest loaded show, capped at 3 h, plus the length), PEAK. Each row is a button (`aria-expanded`) that opens two tiles: **Peak at** (from `stream_sessions.peak_at`: the time, "{n} listening at once"; "Nobody tuned in" or "Not recorded for older shows" when null) and **From** (the same name, with the encoder's software name under it). **Show more** loads the next page (`?finished=1&page=n`), de-duplicating rows that shifted because a show finished meanwhile; a failure says "Couldn't load more shows."

## Creating, editing and deleting a station

### Create

Only surface: `/dashboard` when the account has no station, which renders `CreateStation` (the "Create station" screen of the GoCast Web design project, 2026-10-09). While none exists the phone tab bar is not drawn, and every sidebar item keeps its `/dashboard` href but answers a click with a toast instead of navigating ("Create your station first. Everything here belongs to it.", one toast id so repeats don't stack). Covered by `tests/e2e/create-station.spec.ts`.

`POST /stations` (`StationController::store`, route inside the `verified` group):
1. `StoreStationRequest::authorize()`: `user->stations()->count() < user->plan->max_stations` (counts non-deleted stations only, so deleting frees a slot). Failure is a 403 with no station-specific message. A user whose `plan` relation were null would 500 here (`plan_id` defaults to 1 with an FK, so not reachable in normal data).
2. Rules: `name` required string max 100; `description` nullable string (no max); `genre` nullable string max 255; `artwork_url` nullable string `url:http,https` max 2048. A `slug` in the body is ignored: the link is built from the name, and only the name (decided 2026-10-09 against the comp's editable link).
3. `$user->stations()->create($validated)`, refreshed, returned as 201 with `StationResource`.

`GET /stations/slug-preview?name=` (`StationSlugController`, `throttle:slug-preview` 120/min per user, registered before the resource so it isn't bound as a station): `{data: {name, slug}}`, where `slug` is what `Station::slugFor(name)` would mint right now (null for an empty name), i.e. the same method creating uses, numbered suffix included. A race between preview and create is resolved by the create minting again.

What the `creating`/`created` hooks in `Station::booted` and `StationObserver::creating` do:
- `slug` = `Station::slugFor(name)`: `Str::slug` (empty result, e.g. emoji-only, becomes `station`), truncated to 55 chars (`SLUG_MAX`), then `-2`, `-3`, ... until free. The uniqueness check uses `withTrashed()`, so a deleted station's slug is not reused until the row is force-deleted, and `Station::RESERVED_SLUGS` (`slug-preview`, the static route that sits ahead of the `{station}` binding) count as taken too. Column is `varchar(60)` unique. **The slug is immutable**: it is not in `UpdateStationRequest`, and no hook regenerates it. Renaming changes the name only; the URL stays.
- `icecast_mount` = `/stream/{slug}`; `icecast_password` = `Str::random(32)`; `stream_key` = 32 chars `[A-Za-z0-9]` (`generateStreamKey`, stored with the `encrypted` cast); `desired_state` = `stopped`; jingle defaults (`jingles_enabled` false, `jingle_mode` interval, 1800 s, every 5 tracks).
- `container_index` = `max(container_index, including trashed) + 1`, never recycled (unique).
- After create, a default playlist is created (`Playlist::DEFAULT_NAME`, `is_default`, sequential, position 0).
- **Nothing starts.** A new station has no container and is `state: "offline"` until the owner presses Start AutoDJ or Go live.

Client (`CreateStation`): success toasts "{name} is ready. It’s off air for now." and `router.push` to the new slug. See below.

### Edit

`PUT /stations/{slug}` (`update`): `authorize('update')` (owner only, 403 otherwise), then `station->update($validated)`. `UpdateStationRequest::authorize()` returns `true`; ownership is the controller's job. The request rules are the full settings-form contract; the table below lists every field this endpoint accepts, including ones no dashboard form sends.

| Field | Rule | Sent by | Notes |
|---|---|---|---|
| `name` | `sometimes`, string, max 100 | Station form | `sometimes` plus not nullable: an explicit null is a 422. Restarts a running container. |
| `description` | nullable string | Station form | No length cap; the column is `text`. Restarts a running container. |
| `genre` | nullable string, max 255 | Station form | Restarts a running container. |
| `artwork_url` | nullable string, `url:http,https`, max 2048 | Station form (after an upload) | Any http(s) URL is accepted, not only ones we uploaded. Never restarts the container (the script does not use it). |
| `timezone` | nullable, `timezone:all` | Nothing in the web or mobile apps (both send the zone in `PUT /stations/{slug}/schedules`, [Schedule](schedule.md)) | IANA name only. Clearing to null is a 422 while any show time (`schedules()`) or AutoDJ slot (`autodjSlots()`) exists (`withValidator` after-hook, two separate messages). Column `varchar(64)`. |
| `social_links` | nullable array, max 8 (`Station::MAX_SOCIAL_LINKS`); each element `array:label,url` (extra keys rejected); `url` required string `url:http,https` max 2048; `label` nullable string max 30 | `LinksCard` | Full-list replace; stored as JSON. |
| `theme_config` | nullable array | nothing | **Dead.** Validated, stored and returned, read by no client code. |
| `jingles_enabled` | `sometimes` boolean | Library jingles dialog | Turning it **on** requires AutoDJ (`StationLifecycleService::assertAutoDjEnabled`); turning it off is always allowed. |
| `jingle_mode` | `sometimes`, in `interval`, `tracks`, `times` | Library jingles dialog | |
| `jingle_interval_seconds` | `sometimes` integer 60..14400 | Library jingles dialog | |
| `jingle_every_tracks` | `sometimes` integer 1..100 | Library jingles dialog | |
| `jingle_times` | nullable array, 1..12 items, each integer 0..59, distinct | Library jingles dialog | Minutes past the hour, in the station's zone. Set-times mode with no times is a 422, judged on the row after the request (the request's mode/times, else the saved ones; `withValidator` after-hook), so clearing the times of a station already in that mode is refused. |

`slug` in a payload is ignored. Admin-owned columns (`featured`, `featured_at`, `stream_key`, `desired_state`...) are not in the rules, so `validated()` never carries them. The model uses `$guarded = []`, so anything that bypasses the FormRequest (admin code, factories, tinker) can write any column.

Observer effects on update (`StationObserver::updated`): jingle columns need nothing (Laravel reads them per track). If any of `name, slug, description, genre, icecast_mount` changed and the station is running and nobody is live, `supervisor->up()` restarts it (live: the reconciler does it after the show) (`safely()`: a Docker failure is logged, not thrown, and `stations:reconcile` later converges). A stopped station just picks the change up at next start. Slug-change branches (stop old container, rename the playlist directory) exist but are unreachable through the API today because the slug is immutable.

Audit: `LogsActivity` on `Station` logs only `name, slug, description, genre, featured, desired_state`, dirty only. Artwork, timezone and social links are not in the activity log.

### The create page (`station-form/CreateStation.tsx`)

`PageHeader` "Let’s set up your station." / "A name is all it takes. Everything else can wait.", then a two-column grid (`auto-fit, minmax(24rem, 1fr)`: one column under about 820px, the preview falls below the form). Left, the form; right, a sticky "WHAT LISTENERS SEE" card.

| Field | Control | Behaviour |
|---|---|---|
| Station name | `TextField`, required, `maxLength=100`, autofocus | Drives the link |
| Your link | A read-only field box: `{host}/station/` faint, then the slug (or "your-link" faint until there is one). Under it: "Built from the name. If the name is already someone’s, a number is added." | 400 ms after typing stops, `GET /stations/slug-preview?name=` and the answer replaces the slug; a stale reply is dropped, a failed one leaves the last value. Create never waits for it: the server mints the slug again on create and the overview shows the real one. |
| Genre | Toggle chips (Talk, Jazz, Pop, Rock, Hip-hop, Gospel, Country, Lo-fi, Sports, News, the most common genres on existing stations) plus "Something else…", which opens a `TextField` | Stored as free text, same column as before |
| Description | `TextAreaField`, 160 chars, counter top-right | |
| Artwork | `ArtworkDrop` (as below) | |
| Create | `Button` xl, full width, "Create {name}" (or "Create station" with no name) | Disabled until there is a name, and while saving or uploading. Under it: "Your station starts off air. Nobody can tune in until you go live or start AutoDJ." |

The preview card: the artwork (stripes until one is chosen), the name in display type ("Your station", faint, until typed), the genre `Tag` and an off-air `StatusLamp`, the description, and the link in an inset well with a disabled play disc. Caption: "The name, genre, description and artwork can change any time. The link can’t, so people who saved it always find you."

Submit sends `{name, genre, description, artwork_url}` (trimmed, empties as `null`); no slug. 422 errors land on their fields. 403: "Each account has one station, and yours already exists."; otherwise the server message or "Something went wrong. Nothing was saved." Covered by `CreateStation.test.tsx` and, visually, the `new` account shots in `dashboard-visual.spec.ts` (`create-station`, `-filled`).

### The edit form (`station-form/StationForm.tsx`)

Edit only (it no longer creates), inside `StationFormDialog`, title "Edit station", which mounts the form only while open, so a cancelled edit doesn't reappear next time. Opened from Station settings → Profile → Edit, the overview header (artwork or "Edit profile") and the top bar's setup menu.

| Field | Control | Client | Server |
|---|---|---|---|
| Artwork | `ArtworkDrop`: a dashed drop zone; drop an image or click the tile (or "Choose", hidden below `sm`); preview + Remove once set | `artworkProblem` refuses anything but PNG/JPEG/WebP and over 5 MB before uploading (toast) | Upload: jpg, jpeg, png, webp, gif, max 5120 KB (`UploadRequest`), `throttle:uploads` |
| Name | ds `TextField`, required, `maxLength=100` | Save disabled until there is a name | required, max 100 |
| Genre | `TextField`, `maxLength=255` | | max 255 |
| Description | `TextAreaField` | | no limit |
| Link | "{host}/station/{slug} · the link never changes" (host from `NEXT_PUBLIC_APP_URL`) | | slug immutable |

Server validation errors land on their fields (`errors.name/genre/description`). Artwork: choosing a file shows a local object-URL preview (revoked when replaced) and `POST /upload/images`; the response `data.url` becomes `artwork_url`; an upload failure toasts and restores the previous artwork. Submit sends trimmed values, empty strings as `null`: "Station updated", close, `router.refresh()`. Errors toast the server message or "Something went wrong. Nothing was saved." Covered by `StationForm.test.tsx`.

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
5. **Use your own DJ software** (`EncoderSection` → `EncoderCard`): a folded card `Disclosure` with `id="encoder"` (the pre-flight page's "Using DJ software instead?" anchor), closed by default. Locked (`useEncoderLocked`): a PRO tag in the title, "Go live from BUTT, Mixxx or RadioDJ instead of the browser."; opened, one paragraph and **Request Pro** ("Request sent" once requested). Plan allows but `station.encoder` absent (no ingest router): "Own-software broadcasting isn’t available on this server yet. The browser studio still works for {name}." Available: the Icecast 2 instruction (BUTT, Mixxx, RadioDJ, Audio Hijack and ffmpeg), `EncoderConnection` (Server, Port, Mount, Username, Password rows shown in full (wrapped, not truncated), each with Copy through `lib/clipboard.ts` `copyText`, failure toast "Couldn't copy — select the value and copy it manually"; the password masked with Show/Hide; "Where these go in BUTT, Mixxx and ffmpeg" folded underneath), then the **connection watcher** (`ConnectionWatcher`, mounted only while the fold is open: its own `useStationStatus(slug, true, 2000)` poll says OFF AIR with a **Put it on air** button (`useStationPower.start`; `startRequested` covers the gap before the poll notices), STARTING ("Give it a few seconds, then connect."), WAITING with an indeterminate bar ("{name} is on air. Waiting for your software to connect."), TAKEN (another source holds the mount) or CONNECTED ("{client} is connected." / "Your encoder is connected."); on the first CONNECTED sample it nudges the shared status poll and `router.refresh()`es so the band and overview say live at once), **New key** ("Generate a new stream key?" confirm; `POST /stations/{slug}/stream-key`; the new key shows and is revealed at once, until the refreshed prop's `rotated_at` catches up; toast "New stream key generated"), four folded questions ("Turn the station on first?" (yes: Put it on air above, or Start AutoDJ on the Overview), Shoutcast doesn't work, a new key doesn't kick anyone off, the connection isn't encrypted) and a link to `/help/my-encoder-wont-connect`. Full behaviour: [Encoder ingest](encoder-ingest.md).
6. **Delete this station** (`DeleteStation`): a quiet row with "Delete station…" (below).

### `LinksCard` in detail

A list of saved links (site icon, name, the address without its scheme, **Remove**), then an address field, an optional **name** field (max 30, placeholder = `suggestSocialLabel`: the platform name the address resolves to, else its hostname, else "Name (optional)") and **Add** (or Enter). Add and Remove both save at once: `PUT /stations/{slug}` with the whole `social_links` array, toast "Link added" / "Link removed", `router.refresh()`. There is no Save button and no editing of a saved name; names are kept as they were, because every save sends the list back as it was. A typed name that only repeats the suggestion is sent as `label: null` (so a platform rename follows the platform, and the name only matters for the globe: a Ko-fi or a personal site can read "Tip jar" rather than "ko-fi.com"); otherwise the trimmed name is the label.

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
| `GET /stations/{slug}/sessions` | `StreamSessionController::index` | owner | `latest('started_at')->paginate(20)`; `?finished=1` leaves out the open session. Paginator JSON (top-level `data`, `total`, `current_page`, `last_page`) plus, **on page 1 only**, `summary: { shows, live_seconds }` over every finished session (it scans the whole history, and "Show more" pages have no use for it). Used by the Overview, Your shows and the mobile station screen |
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
| Help | `HelpLink` (sparingly, always a new tab): `/help/turning-your-station-on-and-off` ("what each station status means") by the hero's state lamp, and beside page titles such as Audience. |

## Gaps and traps

1. **One station per account is a client convention.** The API allows `max_stations` (Free 1, Pro 5). A Pro user creating a second station via API gets it silently ignored by the dashboard, which resolves the oldest. The form's 403 text "Each account has one station, and yours already exists." is therefore only accurate for Free.
2. **Editing name, genre, description or artwork restarts a running station** and drops listeners; the form gives no warning. Only jingles, timezone and links are restart-free.
3. **The form's 403 message is wrong in edit mode.** Any 403 (for example the `email_unverified` middleware response) toasts "Each account has one station...". The axios interceptor also toasts "Verify your email to continue." for that code.
4. **Artwork: GIF is accepted by the server but refused by the client** (`ARTWORK_TYPES` is PNG/JPEG/WebP). Both cap at 5 MB.
5. **`artwork_url` accepts any http(s) URL** and the column is `varchar(255)` while the rule allows 2048 (a long URL 500s at the database). `next.config.ts` `images.remotePatterns` allows only `https://{host of NEXT_PUBLIC_API_URL, else api.gocast.fm}/storage/**`, `https://lh3.googleusercontent.com/**` and `http://localhost:8000/storage/**`, so an arbitrary external artwork URL fails in the Next image optimizer (in development images are `unoptimized`, so the problem only appears in a production build).
6. **Uploaded artwork is never deleted**, on replace, on station delete or by the prune.
7. **`description` has no length limit** at the API or in the form.
8. **Delete copy vs behaviour.** The dialog says "This is permanent and can't be undone"; in reality the rows and audio survive 30 days (`stations:prune-deleted`) and restore is possible by hand. `desired_state` is not reset, so a restored running station comes straight back on air. Delete does not check for a live broadcast or close its open `StreamSession`. Artwork files stay forever.
9. **`/dashboard/station/{path}` allowlist omits `schedule` and `playlists`** (and anything nested; `STATION_PAGES = studio, live, library, audience, settings`). A link to `/dashboard/station/schedule` or `/dashboard/station/playlists` lands on the Overview.
10. **Layout trusts the `user` cookie**: a malformed cookie throws instead of redirecting; `email_verified_at` and identity come from the cookie, not `/user`.
11. **`state` on the page payload is intent-only.** The band, sidebar lamp and hero wait for the poll ("CHECKING"), but server-rendered uses of `station.state` (the header's "Last live", the Coming up and Account pages) are intent-based.
12. **The 14-day figure is limited to the newest 20 sessions.** `ShowsLinks` gets `truncated = total > 20`; `liveShows` then returns no comparison (nothing shows it any more anyway) and its airtime counts only what fits in the newest 20.
13. **The overview's `loading.tsx` draws the old layout** (header with description, two tall cards at the bottom), so the skeleton and the page it stands in for no longer share a geometry.
14. **`show()` loads every stream session** for `stats`; cost grows with broadcast history.
15. **Hand-synced strings**: the stream quality in `StreamCard` (`MP3 · 128 kbps · 44.1 kHz`) must match `station.blade.php`. If `NEXT_PUBLIC_APP_URL` is unset the player link is relative.
16. **`theme_config` and `watermarked` are dead** (validated/stored/sent, rendered nowhere). Do not build on them.
17. **Slug is immutable**, so a renamed station keeps its old URL forever; the observer's slug-change code is unreachable through the API.
18. **Plan data is per layout render.** After a Pro grant, the sidebar and locks only change on the next full dashboard render (`router.refresh()` or reload); `ProRequestContext.requested` is not persisted.
19. **The DJ-software fold opens closed.** Its `Disclosure` carries `id="encoder"` (the pre-flight page's "Using DJ software instead?" anchor), so a link scrolls to it, but nothing opens it.
20. **`timezone` on `PUT /stations/{slug}` has no sender.** Both apps set the zone through `PUT .../schedules`, so the `UpdateStationRequest` timezone-clear guard is only reachable by direct API calls.
21. **`POST`/`DELETE /stations/{slug}/sessions` are unused** by web and mobile. `destroy` authorises on the station but does not check that the session belongs to it (no `scoped()` on the nested route).
22. **`/dashboard/broadcasts` masks every failure as 404** (`catch { notFound() }`), including 5xx and timeouts.
23. **Links save on every Add/Remove** with the whole list; two tabs editing links at once overwrite each other.

## Tests

- `api/tests/Feature/Models/StationSlugTest.php`: slug generation, collision suffixes, emoji fallback, soft-deleted collision, immutability, create via API.
- `api/tests/Feature/Models/StationSoftDeleteTest.php`, `UserSoftDeleteTest.php`: soft delete and cascade from user.
- `api/tests/Feature/PruneDeletedStationsTest.php`: window, `--days`, disabled retention, `--dry-run`, deleted accounts.
- `api/tests/Feature/StationSocialLinksTest.php`: order, clear, protocol allowlist, required url, unknown keys, max 8, label length, public visibility, cross-owner block.
- `api/tests/Feature/StationObserverTest.php`, `StationJingleSettingsTest.php`, `StationEncoderResourceTest.php`, `StreamKeyRotationTest.php`, `StationStatsTest.php`, `StationPowerControllerTest.php` (creates a station off air), `Auth/EmailVerificationEnforcementTest.php` (station routes need a verified email).
- `DerivedStationStateTest.php` (the intent-derived `state`/`is_live`/`is_on_air` vs `/status`), `StationContainerIndexTest.php` (index allocation, never reissued), `StationHlsUrlTest.php` (`hls_url`).
- `api/tests/Feature/StreamSessionIndexTest.php`: the sessions summary over every finished show, `?finished=1`, paging, owner only.
- Client unit tests (Vitest, `npm test`): `lib/airState`, `lib/stationHero`, `lib/comingUp`, `lib/liveShows`, `lib/showsTrend`, `lib/dashboardNav`, `lib/format`, `lib/socialLinks` (`resolveSocialLink`, including the host check), `components/ds/*.test.tsx`, `ConfirmDialog.test.tsx`, `StationForm.test.tsx`, `ShowTimesEditor.test.tsx`, `account/PlanCard.test.ts`.
- `client/tests/e2e/dashboard-visual.spec.ts` (`npm run test:visual`): every page and main state at desktop and phone width ([Dev environment and testing](dev-environment-and-testing.md)).
- No test found for `StoreStationRequest` plan-limit rejection or for `UpdateStationRequest` timezone-clear guard beyond the schedule tests in `StationScheduleTest.php` ([Schedule](schedule.md)).

## History

- Plans and handoffs (history only, not spec): `docs/AUTODJ-SCHEDULING-HANDOFF.md`, `docs/MOBILE-APP-HANDOFF.md`. Related feature docs: [Schedule](schedule.md), [Station lifecycle](station-lifecycle.md).
