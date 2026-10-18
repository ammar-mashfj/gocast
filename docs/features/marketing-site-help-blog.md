---
feature: Marketing site, help centre and blog
verified: 2026-10-18 against 73158c8 plus uncommitted work (feat/dashboard-design); help and blog bodies re-read after the 2026-10-18 edits (embed-the-player, share-your-station, playlists-and-the-rotation, create-your-station, schedule-playlists-by-time, the scheduling post)
sources:
  - client/app/layout.tsx
  - client/app/sitemap.ts
  - client/app/robots.ts
  - client/app/manifest.ts
  - client/app/station/sitemap.ts
  - client/next.config.ts
  - client/lib/seo.ts
  - client/lib/env.ts
  - client/lib/public-api.ts
  - client/interfaces/Plan.ts
  - client/components/ProAccessDialog.tsx
  - client/components/dashboard/HelpLink.tsx
  - client/tests/e2e/help-screenshots.spec.ts
  - client/playwright.config.ts
  - client/app/(marketing)/layout.tsx
  - client/app/(marketing)/blog/page.tsx
  - client/app/(marketing)/blog/[slug]/page.tsx
  - client/app/(marketing)/help/page.tsx
  - client/app/(marketing)/help/[slug]/page.tsx
  - client/app/(marketing)/privacy/page.tsx
  - client/app/(marketing)/terms/page.tsx
  - client/app/(marketing)/discover/page.tsx
  - client/app/(marketing)/discover/DiscoverFilters.tsx
  - client/app/(marketing)/discover/loading.tsx
  - client/app/(marketing)/help/_content/articles.ts
  - client/app/(marketing)/blog/_content/articles.ts
  - client/app/(marketing)/blog/_content/broadcasting-from-your-phone.tsx
  - client/app/(marketing)/blog/_content/how-does-an-internet-radio-station-work.tsx
  - client/app/(marketing)/blog/_content/how-much-does-it-cost-to-run-an-internet-radio-station.tsx
  - client/app/(marketing)/blog/_content/how-to-schedule-playlists-on-your-radio-station.tsx
  - client/app/(marketing)/blog/_content/how-to-start-an-internet-radio-station-2026.tsx
  - client/app/(marketing)/blog/_content/keep-your-radio-station-on-air-24-7.tsx
  - client/app/(marketing)/help/_content/broadcast-from-butt-or-mixxx.tsx
  - client/app/(marketing)/help/_content/create-your-account.tsx
  - client/app/(marketing)/help/_content/create-your-station.tsx
  - client/app/(marketing)/help/_content/embed-the-player.tsx
  - client/app/(marketing)/help/_content/free-and-pro.tsx
  - client/app/(marketing)/help/_content/go-live-from-your-browser.tsx
  - client/app/(marketing)/help/_content/my-encoder-wont-connect.tsx
  - client/app/(marketing)/help/_content/my-station-went-off-air.tsx
  - client/app/(marketing)/help/_content/nobody-can-hear-my-station.tsx
  - client/app/(marketing)/help/_content/playlists-and-the-rotation.tsx
  - client/app/(marketing)/help/_content/read-your-audience-page.tsx
  - client/app/(marketing)/help/_content/schedule-playlists-by-time.tsx
  - client/app/(marketing)/help/_content/share-your-station.tsx
  - client/app/(marketing)/help/_content/turning-your-station-on-and-off.tsx
  - client/app/(marketing)/help/_content/upload-your-music.tsx
  - client/app/(marketing)/help/_content/using-the-studio.tsx
  - client/app/(marketing)/help/_content/your-player-page.tsx
  - client/components/common/TrustCues.tsx
  - client/components/content/Prose.tsx
  - client/components/content/ZoomableImage.tsx
  - client/app/(home)/layout.tsx
  - client/app/(home)/page.tsx
  - client/app/dashboard.css
  - client/components/homepage/CtaSection.tsx
  - client/components/homepage/Footer.tsx
  - client/components/homepage/heroSection/HeroLevelMeter.tsx
  - client/components/homepage/heroSection/HeroSection.tsx
  - client/components/homepage/heroSection/HeroStationPlayer.tsx
  - client/components/homepage/heroSection/official.ts
  - client/components/homepage/HowItWorks.tsx
  - client/components/homepage/ListenerLibrary.tsx
  - client/components/homepage/navbar/MobileMenu.tsx
  - client/components/homepage/navbar/Navbar.tsx
  - client/components/homepage/navbar/UserMenu.tsx
  - client/components/homepage/PricingSection.tsx
  - client/components/homepage/ProgrammeSection.tsx
  - client/components/homepage/Section.tsx
  - client/components/homepage/StudioDeck.tsx
  - client/components/homepage/StudioSection.tsx
  - client/components/homepage/WaitlistButton.tsx
  - client/components/homepage/WeekGrid.tsx
  - client/components/homepage/WeekDayList.tsx
  - client/components/homepage/weekMock.ts
  - client/components/homepage/Wordmark.tsx
  - api/app/Http/Controllers/WaitlistController.php
  - api/app/Http/Requests/StoreWaitlistRequest.php
  - api/app/Http/Requests/StoreProAccessRequest.php
  - api/app/Models/WaitlistEntry.php
  - api/routes/api.php
  - api/app/Http/Requests/StoreStationRequest.php
  - api/app/Http/Requests/StoreTrackRequest.php
  - api/app/Console/Commands/SweepStations.php
  - api/app/Services/StationAudioPolicy.php
  - api/config/liquidsoap.php
  - api/app/Http/Controllers/PublicStationController.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Http/Requests/ReplaceAutodjSlotsRequest.php
  - api/app/Http/Controllers/AudienceController.php
  - api/app/Services/StationLifecycleService.php
  - client/contexts/ProRequestContext.tsx
  - client/components/dashboard/EncoderConnection.tsx
  - client/instrumentation-client.ts
  - client/lib/broadcast.ts
  - api/tests/Feature/PublicStationSeoTest.php
  - api/tests/Feature/PublicFeaturedTest.php
  - api/tests/Feature/WaitlistControllerTest.php
  - api/app/Http/Controllers/TrackController.php
  - api/app/Http/Controllers/PlaylistController.php
  - api/app/Http/Controllers/AutodjSlotController.php
  - api/app/Http/Requests/UpdateStationRequest.php
  - api/app/Models/Station.php
  - client/lib/station-server.ts
  - client/components/dashboard/AppSidebar.tsx
  - client/lib/dashboardNav.ts
  - client/lib/airState.ts
  - client/lib/stationHero.ts
  - client/lib/micPrefs.ts
  - api/database/migrations/2026_04_16_131050_create_plans_table.php
  - api/database/migrations/2026_09_02_100000_raise_plan_listener_caps.php
  - api/database/migrations/2026_08_15_115900_add_feature_columns_to_plans_table.php
  - api/database/migrations/2026_09_01_100000_add_analytics_days_to_plans_table.php
  - api/database/migrations/2026_09_08_100000_add_embed_enabled_to_plans_table.php
  - api/database/migrations/2026_09_15_140000_add_encoder_enabled_to_plans_table.php
  - api/resources/views/liquidsoap/station.blade.php
  - client/components/dashboard/shell/SetupMenu.tsx
  - client/lib/setupItems.ts
  - client/components/dashboard/overview/OverviewHero.tsx
  - client/components/dashboard/overview/OverviewHeader.tsx
  - client/components/dashboard/share/ShareDialog.tsx
  - client/components/dashboard/EmbedDialog.tsx
  - client/app/dashboard/stations/[slug]/schedule/SchedulePlanner.tsx
  - client/app/dashboard/stations/[slug]/settings/StreamCard.tsx
  - client/components/studio/StudioStats.tsx
  - client/app/auth/login/page.tsx
  - client/components/dashboard/ProRequestDialog.tsx
  - client/hooks/useAccessRequest.ts
  - client/components/dashboard/station-form/StationForm.tsx
  - client/app/dashboard/stations/[slug]/live/page.tsx
fingerprint: 67ad0a64daa00139
---

# Marketing site, help centre and blog

The public, signed-out face of GoCast: the homepage, `/help` (17 task articles), `/blog` (6 essays), `/privacy`, `/terms`, the sitemaps and metadata, and the "request Pro / talk to us" form. Everything is hand-written React in `client/`. There is no CMS: an article is a `.tsx` file plus an entry in a registry array.

**The one thing people get wrong:** the copy is not generated from the product. Plan limits, button names and screenshots are typed by hand in about 30 places, so they drift. Section "Claims the code contradicts" lists what has drifted as of 2026-10-18. Help articles carry an `updated` date that nothing forces you to bump.

## Routing and layout

| URL | File | Notes |
|---|---|---|
| `/` | `client/app/(home)/page.tsx` | There is **no** `client/app/page.tsx`; the homepage has its own `(home)` group with its own layout (below). Calls `isAuthenticated()` and passes `isAuthed` to the hero and CTA. Canonical pinned to `/`. |
| `/blog`, `/blog/[slug]` | `(marketing)/blog/` | Index sorted by `date` descending. |
| `/help`, `/help/[slug]` | `(marketing)/help/` | Index grouped by category. |
| `/privacy`, `/terms` | `(marketing)/privacy`, `terms` | Static prose, "Last updated" typed in the page. |
| `/discover` | `(marketing)/discover/page.tsx` | **Dead.** `next.config.ts` redirects `/discover` to `/` (307) and the page itself also `redirect("/")`. `DiscoverFilters.tsx` and `loading.tsx` remain. |
| `/roadmap` | none | Permanent (308) redirect to `/` in `next.config.ts`. |

`(marketing)/layout.tsx` wraps blog, help, legal and discover: `Navbar`, children, `Footer`, no width cap (each page caps its own measure). `(home)/layout.tsx` wraps the homepage alone the same way (sections run edge to edge and cap their own content at `max-w-page`, 1240px). **Both** mark themselves `data-surface="marketing"` (the marketing group since 2026-10-09): that is the selector `app/dashboard.css` scopes the **GoCast Design System** to (`.dark:has([data-surface="dashboard"], [data-surface="marketing"])`), so every public page, its navbar, footer and toasts wear the dashboard's warm palette, Bricolage body and Plex Mono. The older marketing palette survives only as the fallback values of the `globals.css` tokens, which is why terms and privacy (still written in those classes) take the warm palette without being touched; the blog index, blog article, help index, help article, `Prose` and `ZoomableImage` were rewritten on the ds tokens and laid out across the full `max-w-page` width, left-aligned to the navbar: the indexes are two-column rows from `lg` (date / category on the left, entries on the right), the article pages keep the body at the `max-w-3xl` reading measure with a sticky right rail from `lg` ("More from the blog" + sign-up card on the blog, "Read next" + "Still stuck?" on help); the old `md:-ml-14` side-bleed wrapper on article screenshots was removed since the column no longer centres (help articles show a `ProTag` beside the eyebrow and an on-air-tint "needs Pro" chip; "Read next" and the "Still stuck?" card are ds cards). `dashboard.css` also carries the two homepage-only type tokens `text-marquee` (hero line, closing question) and `text-section` (section headings), registered in `lib/utils.ts`. Auth, dashboard, station and embed pages are outside both groups and have their own chrome.

`Navbar` (server component, sticky) calls `getSession()`. The logo is the text `Wordmark` (Go / Cast in violet / .fm faint; `/logo.svg` is still referenced by the JSON-LD only). Links: How it works (`/#features`), Pricing (`/#pricing`), Blog, Help, shown from `md`. Signed out it shows Sign in and a `ds/Button` Sign up from `md`; signed in it shows `UserMenu` (first name, Dashboard, Sign out via `useSignOut`). Below `md`, `MobileMenu` is a subtle "Menu"/"Close" button that opens an in-page panel absolutely positioned under the sticky header: the four links as 56px display-type rows, Sign in, and a full-width Sign up (or "Open dashboard" when signed in); it closes on a link, Escape, a tap outside, or the viewport crossing `md`. The old right-hand sheet is gone; the only `components/ui` import left on the homepage is `UserMenu`'s `ui/dropdown-menu`. `Footer`: Help, Blog, Terms, Privacy, contact `hello@gocast.fm` (questions) and `business@gocast.fm` (press), and X/Facebook/Instagram links. No link to `/discover`.

## Homepage sections (in order)

`HeroSection` (`id="top"`), `HowItWorks` (`id="features"`), `StudioSection` (`id="studio"`, card-coloured band), `ProgrammeSection` (`id="autodj"`, includes the "Also included in Pro" cards), `ListenerLibrary`, `PricingSection` (`id="pricing"`, card-coloured band), `CtaSection`. Rebuilt 2026-10-07 on the design system from the Claude Design comp "GoCast Homepage v3" (project "GoCast Homepage Redesign"), keeping the registration flow, the Pro card without a button, per-playlist colours, the signed-in states and the listener row; the comp's in-page station-creation sheet, Pro button and "you, live" grid lane were not taken. `Section` / `SectionIntro` / `Points` (`Section.tsx`) are the shared band, intro and three-claims layouts.

- **HeroSection** (async server component). Headline "Your voice. On air in 60 seconds." Fetches `GET {apiUrl}/public/stations/gocast-official-station` with `next: { revalidate: 30 }` and `publicApiHeaders()`; on any failure returns `null` and the player renders off-air. CTA: `/auth/register` "Create a free station", or `/dashboard` "Open dashboard" when authed; `TrustCues` only when signed out.
- **HeroStationPlayer** (client). The play button is a toggle over `playing || loading` (a second press while connecting cancels); `playing` is set only by the `<audio>` element's own `playing` event and `onWaiting` puts it back to loading, so the meter never runs before there is sound. A `rounded-hero` card: `StatusLamp` (Off air / Live / On air), "Player page" link, square artwork, an "Official" tag, the station name, and a transport well whose line shows the polled track while playing ("Listen in" at rest, "Connecting…", "Nothing on air right now"), and a 24-segment level meter (`HeroLevelMeter`: green/amber/red like the studio meter, simulated level, static under reduced motion) only while playing. No listener count on the hero (dropped 2026-10-09; the poll still fetches it). Plays the real official station: `OFFICIAL_SLUG = 'gocast-official-station'` (`official.ts`), HLS URL constant `https://stream.gocast.fm/gocast-official-station/aac.m3u8` (used unless `station.hls_url` is present), artwork `/official-station-512.png` from `/public`. Silent until clicked. hls.js config: `backBufferLength: 30`, `liveSyncDurationCount: 2`, `pLoader: createPlaylistLoader`. Ladder: manifest 404 marks the station failed/off air; other network errors go to `createNetworkRecovery`; media errors `recoverMediaError`; anything else falls to Icecast (`env.icecastUrl + station.icecast_mount`, only when the API answered). Safari uses native HLS. Polling via `usePublicStationFeed` and listener counting via `useListenerSession` are both gated on `playing`, so bounce visitors cost no polling. Badge states: Off air (`failed` or API says not on air), Live, On air; unknown counts as On air (optimistic, by design).
- **HowItWorks**: three static steps (Create your station, Go on air, Share your link) with times "15 seconds", "1 click", "Instant".
- **StudioSection + StudioDeck** (client): a **working mock** of the on-air deck for a fictional station "Late Shift" with five fictional tracks. A 100 ms timer walks the running order (repeat all / one, the real studio's two modes), the pad opens a pretend mic (pointer with capture, Enter, or Space), the listener count drifts every 2.4 s and lifts the peak, and the status lamp reads Live / On mic / Silence with a show clock. Keyboard shortcuts K / N / P / R and Space apply **only while the deck is "in view"**: at least half of it on screen, or filling at least half the window's height (so a deck taller than two screens, a phone held sideways, still counts; IntersectionObserver with thresholds 0–1). They are ignored while typing and while focus is on a button, link, `role=button`, contenteditable or inside a dialog (so the deck's own Copy link and the QR dialog stay keyboard-pressable). Scrolling the deck away releases the mic. The timer also stops off screen. The shortcut row is hidden below md (no keyboard on a phone) and the pad's hint there says to keep a finger down instead of "hold Space". "Copy link" and the Space hint only raise a sonner toast (nothing is copied: the link is fictional). The QR tile is a real, scannable `QRCodeSVG` of a demo message ("Welcome to GoCast! You just scanned a radio station that doesn't exist (yet)… https://gocast.fm"); pressing it opens a "Scan me" dialog with a 280 px copy. The pad reads "Hold anywhere here to talk" / "Mic live while held". No audio, no fetch. Tag Free.
- **ProgrammeSection + WeekGrid** (client): the Schedule page's week grid, Monday first, with fixed slots Morning Coffee, Drivetime, Weekend Brunch, Late Night (the last wraps midnight and is split into two segments, as the API resolves it). Each playlist wears a `lib/playlistSwatches` violet by index, as on the real page. The chips above it filter (others fade to 15%); the lamp says "On air · {playlist}" and the today marker is drawn from **this browser's clock**, read after mount so SSR and client agree (before mount: "On air", no marker). There is no "your show times" lane: the web Schedule is AutoDJ-only. Below md the grid, chips and legend are replaced by `WeekDayList` (a seven-day strip with dates from the browser clock, then the picked day's rows with explicit "All Tracks" gap rows, midnight-wrap notes and a "Now" mark), mirroring the dashboard's `DayList`; the slots live in `weekMock.ts`, shared by both. Three bullets (the third says slots start at the next track change "or on the dot if you switch that on"), `ProTag`, then four "Also included in Pro" cards: "A stream URL of your own" (TuneIn/Sonos/VLC), "A player on your own site" (the iframe embed, "copied from your dashboard"), "Broadcast from your own gear", "Know who is listening" (90 days; live count and peak "stay free on every plan"). See contradictions.
- **ListenerLibrary**: client-only, reads `getSaved()` / `getHistory()` from `lib/listenerLibrary` (localStorage). Renders nothing until hydrated and nothing when both lists are empty; up to 4 saved and 4 recent (recent excludes saved).
- **PricingSection**: lead "Free needs no card and never runs out. Everything below is live today — Pro is there when you outgrow it." Free card (raised, 8 bullets, a footnote "Broadcast mic, files or both. It plays while your browser is open, and goes quiet when you close it." and "Start broadcasting free" to `/auth/register`), Pro card (`pro-tint`, "$20 / month", `PRO_PRICE_USD` from `interfaces/Plan.ts`, bullets from `PRO_FEATURES` in the same file (shared with the dashboard upsell), **no button**, "Ask for it from your dashboard once your station is set up, and we’ll email you how to pay."), Custom card (`on-air-tint`, tag "Made to order", four bullets: unlimited listeners, a white-label player, a full website around the player with pages/widgets/templates, "something we haven't built yet", then an "Add-on · Custom design" well — the website and the design are built to order, not shipped features; added 2026-10-09) with `WaitlistButton` styled as a ghost `ds/Button`. Footer text "Pricing last updated 14 October 2026" is a typed constant `LAST_UPDATED`. The homepage no longer has a featured-stations rail: `LiveNow` was removed on 2026-10-07 (the `GET /public/featured` endpoint and `Station::FEATURED_RAIL_SIZE` still exist on the API, unused by the client).
- **CtaSection**: `/auth/register` "Start broadcasting free", or `/dashboard/stations` "Open dashboard" when authed (the hero sends authed users to `/dashboard`; the two differ).

### Removed 2026-10-07

`FeaturesSection`, `HeroPlayerMock`, `Equalizer`, `uptime.ts`, `StudioMock`, `WeekGridMock`, `CapabilityStrip`, `LiveNow` (+ its CSS module) and `PlanBadge` were deleted with the rebuild; `components/homepage` has no dead files. The Pro tags now come from `ds/Tag`.

## The request form (waitlist)

- `WaitlistButton` opens `ProAccessDialog` (`client/components/ProAccessDialog.tsx`), passing `plan`. Only the Custom card on the homepage uses it now.
- The dialog has two modes keyed on `plan === "pro"`. **Custom** (public): fields email, link, message; `POST /waitlist` with `{email, plan, social, message}`. **Pro**: the dashboard no longer uses this component; it draws its own `components/dashboard/ProRequestDialog.tsx` (ds kit, mounted once by `client/contexts/ProRequestContext.tsx`, opened by every "Get Pro" button: sidebar plan card, Account plan card, AutoDJ/Schedule/Audience upsells, the DJ-software fold, the Embed button). Both draw the form from `hooks/useAccessRequest.ts`, so the rules match: `POST /waitlist/pro` with `{social, message}`; the server reads email and plan from the session.
- Client validation: email regex (custom only); `social` must contain a `.` ("full link"); `message` max 2000, `social` max 255. Errors: 401 session expired, 429 "Too many attempts", 422 "check the details", else generic.
- API (`api/routes/api.php`): `POST /waitlist` sits under `throttle:3,60,waitlist` (3 per IP per hour, its own limiter), unauthenticated. `POST /waitlist/pro` is `auth:sanctum` only, deliberately outside `verified`.
- `StoreWaitlistRequest`: `plan` must be `custom` (`PUBLIC_PLANS`), so posting `pro` publicly is a 422. `social` required, max 255; `message` nullable max 2000; `email` required, max 255.
- `WaitlistController::record` does `updateOrCreate(['email','plan'], ...)`: resubmitting overwrites social/message. A `rejected` row is reopened to pending; an `approved` row is left alone. Responds 201 `{message: "Request received."}`.
- `WaitlistEntry` has statuses pending/approved/rejected, `$fillable` excludes review columns. `isGrantable()` is true only for a pending row with a `user_id`, so Custom rows (no `user_id`) are never grantable. Model events call `AdminTelegram::accessRequested` (registered in `AppServiceProvider`), which is inert without `TELEGRAM_BOT_TOKEN`. Review UI is in [admin-panel](admin-panel.md); granting is in [accounts-plans-invites](accounts-plans-invites.md).
- API tests: `api/tests/Feature/WaitlistControllerTest.php`.

## Help centre

**Registry:** `help/_content/articles.ts` exports `HELP_ARTICLES` (17), `CATEGORIES` (5), `getHelpArticle`, `articlesInCategory`, `relatedArticles` (drops unknown slugs silently). An article is `{slug, title, description, category, updated, Body, pro?, related?}`. `Body` is a React component from its own `.tsx` file.

**Rendering:** `help/[slug]/page.tsx` uses `generateStaticParams` from the registry; an unknown slug calls `notFound()`. Metadata: title `absolute: "<title> — GoCast Help"` (absolute because the root template appends "— GoCast"), canonical `/help/<slug>`, OG type `article`, twitter card, image `DEFAULT_OG_IMAGE`. JSON-LD `@graph`: `TechArticle` (with `dateModified: updated`, deliberately no `datePublished`) plus `BreadcrumbList` Home > Help > article. Page furniture: back link, category eyebrow, a "This one needs Pro" note when `pro` (linking to `/help/free-and-pro`), `Prose`-wrapped body, "Read next" cards, and a "Still stuck?" box with `mailto:hello@gocast.fm`. The `updated` field is **not shown**; it feeds JSON-LD and the sitemap only.

**Index:** `help/page.tsx`, one page, no search or pagination. Pro articles carry a `ProTag`. It tells people to email **`support@gocast.fm`**, whereas every other surface uses `hello@gocast.fm`. A closing card ("Looking for the longer reads?") links to `/blog`.

### Articles

Slug, title, category, Pro flag, `updated`, and what it claims.

| Slug | Title | Cat | Pro | Updated | Claims |
|---|---|---|---|---|---|
| create-your-account | Create your account | getting-started | no | 09-21 | Google or email+code; unverified accounts can sign in and edit their account but cannot create a station, upload or go on air; no card. |
| create-your-station | Create your station | getting-started | no | 09-21 (body edited after) | Name, address built from the name and never changing, artwork, description; one station per account; new station is off air; the **set up** chip in the top bar ("2 of 5 set up", `SetupMenu`) lists artwork, description, music for AutoDJ (Pro only), links, first listener and disappears when done (matches `lib/setupItems.ts`). |
| your-player-page | Your player page | getting-started | no | 09-23 (body edited after) | Page at `/station/<slug>`; player, artwork, share/social links; off-air state shows only a notify-email field. The show-times bullet and the "Show Times Are Not the Schedule" section were removed. |
| free-and-pro | What you get on Free and on Pro | getting-started | no | 10-14 | Table: listeners 100/1,000; AutoDJ 3 GB Pro; playlists+scheduling Pro; encoders Pro; embed Pro; audience history "live count only"/90 days; $20/mo, payment arranged by email, prepaid, no auto-renew, unused months refunded; lapse deletes nothing. |
| turning-your-station-on-and-off | Turning your station on and off | going-live | no | 09-21 (body edited after) | Power vs source; status table Off air, Starting…, Going live, Live / Live · Mic, Show ended, On air · AutoDJ, Silence, Checking, No answer, Not heard (the `airState` labels); buttons Go live / Start AutoDJ / Turn station off; going live starts the station; auto-stop after ten minutes. |
| go-live-from-your-browser | Go live from your browser | going-live | no | 10-01 | Steps: Studio or Go live now, Mic + music / Music only, Check your mic, running order, press **Go live** and the checks run, on air when they pass; "about fourteen seconds" delay; what ends a broadcast; reconnect survives wifi hiccups; phone rule; ~10s tail after stop. |
| using-the-studio | Using the studio | going-live | no | 09-21 | Mic meter, file queue (Repeat list/track, local only), push-to-talk ducks music to "a fifth", "Keep mic on" / L (the button reads "Keep mic open"), monitor excludes mic, encoder health "N s lost". |
| broadcast-from-butt-or-mixxx | Broadcast from BUTT, Mixxx or RadioDJ | going-live | yes | 09-21 | Icecast 2 protocol; five values, username always `source`; not Shoutcast, not OBS; encoder does not switch the station on; one broadcaster at a time. |
| upload-your-music | Upload your music | autodj | yes | 10-05 | MP3/M4A/AAC/FLAC/OGG/WAV (API also accepts `mpga`); 300 MB per file (`max:307200` KB); 30 files per request (`files` max 30, also `MAX_BATCH_FILES` client-side, which additionally splits batches at 500 MB); 3 GB per station shared with jingles; lands in default playlist; jingles are on the **Jingles** page under AutoDJ. |
| playlists-and-the-rotation | Playlists and the rotation | autodj | yes | 09-21 (body edited after) | Track in many playlists, counted once; per-playlist position memory; per-playlist shuffle without repeats; one undeletable default playlist; what plays next is the **Right now** card on the Schedule page (`ScheduleNow`); the Coming up card and its `autodj-rotation.webp` shot are gone. |
| schedule-playlists-by-time | Schedule playlists by day and time | autodj | yes | 10-05 (body edited after) | Week grid, one row per day (drag to draw, drag edge changes one day, Save button); slots crossing midnight; slot starts at next track boundary; timezone shown at the top of the Schedule page with **Change** beside it (`SchedulePlanner`: "Change" / "Set timezone"); "Your Live Shows": going live takes over from any slot. No show-times wording left. It says the slot is edited "in the panel beside it"; `SlotPanel` is the body of a Dialog. Detail in [schedule](schedule.md). |
| share-your-station | Share your station | listeners | no | 09-21 (body edited after) | **Copy player link** on the Overview; **QR code & embed** beside it with the Tune-in code (PNG) and, "on a phone", **Send with…**; link previews; notify-me email. |
| embed-the-player | Embed the player on your site | listeners | yes | 09-21 (body edited after) | Overview → **QR code & embed** → **Embed**; HTML plus a live preview; **Mute button** / **Volume slider** checkboxes (`#volume-on-iphone`: no slider on iPhone/iPad); needs Pro; lapse stops rendering. |
| read-your-audience-page | Read your audience page | listeners | yes | 09-21 | 7/30/90 day windows; chart is listening time; breakdowns; not live/AutoDJ split; today underestimated; Free sees live count only. See [listener-analytics](listener-analytics.md). |
| nobody-can-hear-my-station | Nobody can hear my station | troubleshooting | no | 09-21 | Wait ~15 s; mic meter; encoder health; "Not reaching listeners" is our fault (the band now says NOT HEARD). |
| my-encoder-wont-connect | My encoder will not connect | troubleshooting | yes | 09-21 | Five causes: Shoutcast type, `http://` in server field, station off, mount slashes, another source connected; plus username, plan, rotated key, network. |
| my-station-went-off-air | My station went off air on its own | troubleshooting | no | 09-21 | Stops after ten minutes of silence with nothing attached; listener count is irrelevant; muted mic does not count. |

"(body edited after)": the body changed after the `updated` date in `articles.ts` (360c382 for the week grid and show times moving; 2026-10-18 for show times leaving the web, the new share/embed buttons and the set up chip), and the date was not bumped. Only `free-and-pro` was re-dated (10-14).

**Dashboard links into help** (`components/dashboard/HelpLink.tsx`, always `target="_blank"` so a click cannot end a live broadcast): `upload-your-music` and `playlists-and-the-rotation` (Library), `upload-your-music` (Jingles, unless locked), `schedule-playlists-by-time` (Schedule, unless locked), `read-your-audience-page` (Audience). Plain links to `go-live-from-your-browser` (the go-live checks dialog after a failure, `GoLiveChecks.tsx`), `my-encoder-wont-connect` (Station settings encoder card) and `embed-the-player#volume-on-iphone` (Embed dialog). The sidebar links to `/help`. Nothing links to `turning-your-station-on-and-off` or `using-the-studio` from the dashboard.

## Blog

**Registry:** `blog/_content/articles.ts` exports `ARTICLES` (6) and `getArticle`. Fields: `slug, title, description, date, updated?, readingTime, metaDescription?, image?, Body, faqs?`. `metaDescription` is preferred over `description` for meta and OG.

**Rendering:** `blog/[slug]/page.tsx`: static params, `notFound()` for unknown, title via the root template ("<title> — GoCast"), OG `publishedTime`/`modifiedTime`, image `article.image` (no dimensions) or `DEFAULT_OG_IMAGE`. JSON-LD: `Article` (datePublished, dateModified, image, Organization author/publisher, logo `/logo.png`) plus `FAQPage` built from `faqs`. Visible byline shows date, "Updated", reading time. Hero rendered with `ZoomableImage` (1200x630 declared, `preload`). Footer box "Ready to start your station?" links to `/auth/register`. The blog index (`blog/page.tsx`) uses `pageMetadata` and emits no JSON-LD.

| Slug | Title | Date | Claims |
|---|---|---|---|
| broadcasting-from-your-phone | Broadcasting Radio From Your Phone | 2026-09-27 (no `updated`) | Studio keeps screen awake (wake lock), reconnects for up to two minutes (`RECONNECT_BUDGET_MS = 120000` in `client/lib/broadcast.ts`), push-to-talk releases on focus loss; locking/app switch/call stops the broadcast; free station off after ~2.5 min; "an app is being built". |
| how-to-schedule-playlists-on-your-radio-station | How to Schedule Playlists... | 2026-09-21, updated 10-14, hero `/blog/schedule/hero.webp` | Launch post for playlists and weekly slots; 50 slots max; slot changes at track boundary; overlaps refused; Pro at $20/month, asked for from the dashboard. Steps now say **AutoDJ › Playlists** and **AutoDJ › Schedule**, timezone at the top of the page with **Change**, and **Save**. The show-times section and FAQ were removed (2026-10-18, `updated` not bumped past 10-14). The screenshots are still of the old list editor. |
| how-does-an-internet-radio-station-work | How an Internet Radio Station Actually Works | 2026-09-01, updated 10-14 | Four jobs; 100 vs 1,000 listeners; self-hosting comparison; silent station "switches itself off within a couple of minutes". |
| how-much-does-it-cost-to-run-an-internet-radio-station | What It Actually Costs... | 2026-09-01, updated 10-14 | Licensing, bandwidth (58 MB per listener-hour at 128 kbps), competitor prices; Pro $20/mo. |
| keep-your-radio-station-on-air-24-7 | How to Keep Your... On Air 24/7 | 2026-09-01, updated 10-14 | AutoDJ launch post, Free vs Pro table ("Pro — $20/month"), "Get Pro in the sidebar", we email how to pay. |
| how-to-start-an-internet-radio-station-2026 | How to Start an Internet Radio Station in 2026 | 2026-05-01, updated 2026-10-14, hero `/blog/how-to-start-...webp` | Long guide, platform comparison. GoCast passages checked against code: Free = one station, 100 listeners, no card; Pro $20, 3 GB, encoder ingest, 1,000 listeners, analytics all match the plan rows, but the same passage promises "a custom domain" and a TuneIn/Sonos stream URL (contradictions 1-2) and says Free "deliberately needs you at the browser". Generic industry text (licensing, competitor prices, listener-count benchmarks) is not GoCast-verifiable and was not checked. |

Images: `client/public/blog/schedule/{hero,library,on-now,rotation,slots,week}.webp` (all dated 2026-09-21), `client/public/blog/how-to-start-an-internet-radio-station-2026.webp`.

## Screenshots

**Where used:** help articles reference `/help/*.webp` through `ZoomableImage` with explicit `width`/`height`, and a long `alt` that describes the image. Files in `client/public/help/`: audience-breakdowns, audience-chart, autodj-rotation (**unreferenced** since `playlists-and-the-rotation` dropped the Coming up card), encoder-connection, music-library, player-now-playing, player-page, schedule-on-now (the Right now card; its alt text no longer mentions Your next show), schedule-slots (the Edit slot dialog), schedule-week, share-qr, station-header, station-power (the Overview hero). The eleven dashboard shots were retaken on 2026-10-01 for the redesigned dashboard (before the overview's Copy player link / QR code & embed buttons and the set up chip; whether `station-header.webp` and `station-power.webp` still match the overview was not checked by eye); the two player shots are from 2026-09-21 (the public player was not redesigned). `ZoomableImage` (`components/content/ZoomableImage.tsx`) is a button with a Radix `Dialog` lightbox; second click toggles fit vs 1:1.

**How they are produced:** `npm run test:help-shots` runs `client/tests/e2e/help-screenshots.spec.ts` (Playwright, 2x device scale, 1680x1050). It signs in as the keeper account `shell@gocast.test` (`E2E_PASSWORD`), shoots station `night-shift-shell`, stages only in the page (`dress()` swaps the factory placeholder text, the dev ingest host, and drops `support/help-artwork.webp` into the artwork tile; the schedule shots draw slots and never press Save), and writes **PNG** to `client/tests/e2e/.screenshots/`. Converting to `.webp` (quality 85) and copying into `public/help/` is manual; the spec's header has the loop. It does not shoot the player page.

**Outside the help set:** the `/blog/schedule/*` shots still show the deleted `AutodjSlotsEditor`.
- The capture specs are kept out of `npm run test:e2e` by `grepInvert: /@(screenshots|visual)/` in `playwright.config.ts`; their npm scripts set `E2E_CAPTURE=1` to lift it.

## Metadata, SEO and analytics

- **Root layout** (`client/app/layout.tsx`): `metadataBase` from `NEXT_PUBLIC_APP_URL`; default title "GoCast — Start an Internet Radio Station in Your Browser", template "%s — GoCast"; OG and Twitter defaults (`@gocastfm`); keywords; viewport dark, theme `#8b5cf6`. Deliberately **no** default `alternates` (the homepage pins its own canonical; other pages set theirs).
- `DEFAULT_OG_IMAGE`: `/og-image.jpg`, 1731x909 (`client/lib/seo.ts`). `pageMetadata({title, description, path})` builds canonical + OG + Twitter for plain pages (used by blog index, privacy, terms). `metaDescription(text, max=160)` trims free text at a word boundary.
- **Organization JSON-LD** (Organization, WebSite, SoftwareApplication with a $0 offer) is emitted from the root layout **only when `NODE_ENV === "production"`**, in the `<body>`, with `<` escaped to `<`.
- **Scripts, production only:** Umami (`cloud.umami.is`), Google Analytics `gtag`, Microsoft Clarity. No consent banner. IDs are hard-coded in the layout.
- **Sitemaps:** `app/sitemap.ts` lists `/`, `/blog`, `/help`, `/privacy`, `/terms` plus every blog and help article from the registries. `lastModified` is real data: newest article dates for the index pages, `updated ?? date` for blog, `updated` for help, and typed `2026-09-08` for privacy and terms. `app/station/sitemap.ts` (`/station/sitemap.xml`, `force-dynamic`, fetch revalidate 3600) calls `GET /public/sitemap/stations`, which returns up to 50,000 `Station::indexable()` rows (desired_state running, or has any stream session, or any listener stat). It **throws** on a non-OK API answer so a crawler keeps the last good copy. `robots.ts` disallows `/dashboard/`, `/api/`, `/monitoring`, `/hls-proxy/`, `/stream-proxy/`, and lists both sitemaps; `/auth/` and `/embed/` are left crawlable on purpose so their `noindex` is seen.
- `manifest.ts`: PWA manifest ("GoCast — Live Radio Streaming", standalone, icons `/icon.svg`, `/apple-icon.png`).
- **Server-side fetch key:** `publicApiHeaders()` adds `X-Render-Key` from `RENDER_API_KEY` (server env only) to lift the public API's 60/min per-IP limit for the Next server. If unset, homepage and sitemap fetches can be rate-limited.
- `next.config.ts` headers: everything except `/embed/*` gets `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; `/embed` omits framing headers.

## Legal pages

Both are static JSX with a typed "Last updated" line: privacy **September 26, 2026**, terms **October 14, 2026** (the Pro terms now say: requested from the dashboard, price and payment by email, paid in advance for the chosen term, no auto-renewal, back to Free at the end with nothing deleted, prorated refunds at the monthly price, never owing extra). The sign-in page shows "By continuing with Google, you agree to the Terms and Privacy Policy." under Continue with Google (`app/auth/login/page.tsx`), because Google sign-in creates accounts without the register page's checkbox. Contacts: `privacy@`, `legal@`, `dmca@gocast.fm`. Privacy lists Google OAuth, Sentry (~2% of sessions replayed, half of error sessions), Google Analytics, Umami, Microsoft Clarity, Resend, Cloudflare; cookies `token` (HttpOnly, 30 days), `user`, `sidebar_state`; listening sessions deleted after 90 days; deleted stations kept 30 days. These were not audited against the API; they are copy. Terms section 6 and 4 disagree with each other (below).

## Shared components

- `Prose` (`components/content/Prose.tsx`): the Tailwind `prose prose-invert` wrapper (max 68ch) used by both blog and help; renders an `<article>`.
- `TrustCues` (`components/common/TrustCues.tsx`): "Browser-based", "Listeners need no app", "Free forever"; `compact` (mono, faint, no icons) beside the hero and closing-CTA buttons, `stacked` (with icons and hints) on the register page.
- `PasswordInput`: show/hide eye, used by auth pages and dashboard settings.
- `Wordmark` (`components/homepage/Wordmark.tsx`): the text logo used by `Navbar` and `Footer` on every marketing page.

## Claims the code contradicts

Re-checked against code on 2026-10-18.

1. **Custom domain.** `PRO_FEATURES` in `interfaces/Plan.ts` (the Pro pricing card and the dashboard upsell: "Embed your player, on your own domain"), the 24/7 post and the how-to-start post ("a custom domain") still promise it. There is no custom-domain code in the API or client (grep for domain/DNS finds only these files). The homepage card that promised a DNS record was rewritten to the embed.
2. **TuneIn/Sonos stream URL as a Pro feature.** `PRO_FEATURES`, `ProgrammeSection`'s "A stream URL of your own" card, the 24/7 post's table and the how-to-start post. Station settings "Where listeners find you" (`settings/StreamCard.tsx`) shows the direct stream address to **every** plan, Free included, and nothing gates a public stream by plan: `StationResource` exposes `icecast_mount` and `hls_url` to anyone, and the native kit fronts Icecast with TLS (`infra/native/nginx/gocast-icecast.conf`). Whether that mount is reachable on the live host is a deployment fact that cannot be read from code.
3. **"Priority support"** (`PRO_FEATURES`): no code or process behind it.
4. **Stations per plan.** Resolved 2026-10-01: `create-your-station` now says every account has one station. `plans.max_stations` (5) and `StoreStationRequest::authorize` still exist, and Terms section 6 still mentions station-count limits.
5. **Station address.** Resolved 2026-10-01: the article says the address is built from the name and never changes, even on rename (the slug is immutable; `UpdateStationRequest` ignores it).
6. **Onboarding checklist.** Resolved 2026-10-01: the article lists the real tiles (`components/dashboard/overview/SetupChecklist.tsx`) and Hide for now.
7. **Studio delay "about fourteen seconds"** (`go-live-from-your-browser`, `nobody-can-hear-my-station`) while the studio itself says "heard 15–20 s later" (`StudioStats.tsx`). The harbor buffer was cut to `buffer=5.` (`station.blade.php`), with a 2 s `live_raw` buffer and 4 s HLS segments. Neither figure was measured here.
8. **Ducking "to a fifth".** Only the default. `micPrefs.ts` has three duck levels (`under` 0.2, `low` 0.08, `silence` 0), fade speeds and a "broadcast voice" option; no help article describes the mic settings popover.
9. **Pro gating of playlists/scheduling.** `free-and-pro` says these need Pro. Server enforcement is at upload (`TrackController::store` via `assertAutoDjEnabled`), jingle enabling, and playback (`AutoDjScheduler`). `PlaylistController` and `AutodjSlotController` are explicitly not plan-gated. The clients do gate the door: `AppSidebar.tsx` gives both the AutoDJ and the Schedule items `lock: "autodj"` (a Pro badge for locked accounts), and the mobile schedule screen skips its playlist fetch when locked.
10. **"Get Pro in the sidebar"** (24/7 post): the sidebar button reads "Get" + Pro badge, which matches.
11. **Scheduling "What's Coming Next"** (24/7 post) says scheduled shows are being built; slots shipped (the 09-21 post). The same post's "workaround" text is obsolete.
12. **Schedule blog post screenshots.** The steps now match (AutoDJ › Playlists / Schedule, Change, Save), but the `/blog/schedule/*` screenshots still show the deleted `AutodjSlotsEditor`.
13. **Auto-stop timing.** Help says ten minutes: correct for the default (`LIQUIDSOAP_SILENT_STOP_SECONDS` 600). But a studio that leaves stops the station after `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` (150), so the how-it-works post's "within a couple of minutes" is right only for that case, and `go-live-from-your-browser` says "shortly afterwards" without a number. The `my-station-went-off-air` article does not mention the 150 s path.
14. **Terms section 4** says "every station on GoCast is public... listed in our public directory, featured on our homepage"; there is no directory (`/discover` redirects to `/`) and no featured rail on the homepage since `LiveNow` was removed. (The `TrustCues` "Private until shared" claim that contradicted it is gone: it now reads "Listeners need no app".)
15. **Terms 6 vs 4.** Section 6 says Free plans "carry an audible GoCast identifier in the stream"; section 4 says it is not done today. `plans.watermark_enabled` is true for Free but the clip directory is empty, so it is inert (see [watermark-clips](watermark-clips.md)). `interfaces/Plan.ts` says never to surface it.
16. **Sitemap vs page dates.** `sitemap.ts` stamps privacy and terms `2026-09-08`; the privacy page says September 26 and terms October 14. The comment says to bump both together.
17. **Contact address split.** Help index uses `support@gocast.fm`; footer, article footers and JSON-LD use `hello@gocast.fm`.
18. **`updated` not bumped** on the help bodies marked "(body edited after)" in the article table, nor on the scheduling post after its 2026-10-18 edit.
19. **Homepage CTA target** differs by section (`/dashboard` in hero, `/dashboard/stations` in CTA); both redirect to the one station.
20. **Listener caps are display-only.** Every surface says 100 (Free) / 1,000 (Pro) concurrent listeners, but `plans.max_listeners` is read only to print it (`UserResource`, notifications, admin views, settings page); nothing in `api/app` or the station script refuses a listener over it. The only cap in the infra is the Icecast global `<clients>500</clients>` in `infra/native/icecast/icecast.xml.tpl`.
21. **Blog phone post** says a GoCast app is "being built for iPhone and Android"; an Android app exists in the working tree ([mobile-app-shell-and-auth](mobile-app-shell-and-auth.md)); copy not updated.
22. **Go-live steps.** Resolved: `go-live-from-your-browser` says "Press **Go live**", which is the button's label on the go-live page. It says "you go on air the moment they pass; the studio opens"; in code the studio opens first and the checks run in a dialog over it (`GoLiveChecks.tsx`); harmless.
23. **"Show ended" in the status table** (`turning-your-station-on-and-off`) is described as "your show from this browser has just finished". `airState` also shows SHOW ENDED whenever the poll says `source === "live"` with no broadcaster, i.e. after a show from DJ software, the app or another browser too.
24. **"Send with… on a phone"** (`share-your-station`): the choice appears wherever `navigator.share` exists (`ShareDialog.tsx`), which includes some desktop browsers. Embed help says "You get a line of HTML"; below `sm` the Embed dialog hides the code box and offers only Copy code.

## Gaps and traps

- No client test covers any marketing page, article registry, JSON-LD or sitemap (client tests are dashboard unit tests, `auth.spec.ts`, and the dashboard visual and help screenshot capture specs). On the API side, `PublicStationSeoTest.php` and `PublicFeaturedTest.php` cover the station sitemap and featured endpoints.
- A new article needs: the `.tsx` body, an import and entry in the right `articles.ts`, and (help only) `related` slugs. The sitemap and static params derive from the registry; nothing else needs touching. Nothing validates slugs or `related`; unknown `related` slugs vanish silently.
- Help bodies must not contain a bare `</strong> word` across a wrapped line: use `{" "}` (see the existing `<strong>...</strong>{" "}` pattern).
- Pricing numbers are duplicated: `PricingSection` (`FREE_FEATURES`, `PRO_FEATURES`, `LAST_UPDATED`), `free-and-pro` table, four blog posts, FAQ arrays in `articles.ts` (which are emitted as `FAQPage` JSON-LD, so they must match the visible body), and the DB `plans` rows (100/1,000 listeners, 90 days, 3 GB is `LIQUIDSOAP_STATION_STORAGE_BYTES`). Only `PRO_PRICE_USD` is shared in code.
- `PRO_AVAILABLE = false` in `interfaces/Plan.ts` means there is no checkout. All "upgrade" paths are request forms.
- Every public page gets the design-system palette only through `data-surface="marketing"` on its route-group layout; removing the attribute silently drops the page back to the older palette with the design-system classes still in place, which looks broken rather than failing.
- Terms and privacy still use the older palette's class names (`text-white`, `bg-white/[0.02]`, `text-text-muted`…); they look right only because those tokens fall back through `--ds-*`. Anything hard-coded there (`zinc-*`, `#08080d`) will not follow the palette.
- The hero depends on a real station `gocast-official-station` existing and streaming from `stream.gocast.fm`; if the API is down the card falls back to a plausible "On air" state until play fails (documented optimistic default).
- `/discover` redirect exists in two places (config and page); removing only one leaves it redirected.
- Dead code: `discover/*` (see routing). The homepage itself has none since 2026-10-07.
- The studio deck hijacks Space while it is "in view" (half of it on screen or half the window filled; the page doesn't scroll on Space there) unless focus is on a control; the hint under the deck says so. `components/homepage` is **not** under the dashboard lint guardrails (`eslint.config.mjs` `DASHBOARD_FILES`), so token discipline there is by convention.
- `help-screenshots.spec.ts` signs in as the local keeper account `shell@gocast.test`; it needs that account and its station, so it only runs against a dev database that has them.

## Tests

Client: none. API: `PublicStationSeoTest.php`, `PublicFeaturedTest.php` (the endpoints the sitemap and rail read) and `api/tests/Feature/WaitlistControllerTest.php` (public/Pro request, upsert, reopen after reject, approved untouched, Pro plan refused on the public endpoint) and Telegram/admin tests for the queue. `client/tests/e2e/help-screenshots.spec.ts` is a screenshot generator, not a test (`npm run test:help-shots`).

## History

Plans and handoffs (history only): `docs/AUTODJ-SCHEDULING-HANDOFF.md` (schedule blog and help), `docs/GROWTH-FEATURES-2026-09-23.md` (SEO ideas), `docs/CASTER-FM-GAP-ANALYSIS.md`. Related feature docs: [schedule](schedule.md), [public-player-and-embed](public-player-and-embed.md), [accounts-plans-invites](accounts-plans-invites.md), [listener-analytics](listener-analytics.md).
