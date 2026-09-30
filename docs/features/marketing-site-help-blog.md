---
feature: Marketing site, help centre and blog
verified: 2026-09-29 against 360c382 plus uncommitted work
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
  - client/app/(marketing)/page.tsx
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
  - client/components/common/PasswordInput.tsx
  - client/components/common/TrustCues.tsx
  - client/components/content/Prose.tsx
  - client/components/content/ZoomableImage.tsx
  - client/components/homepage/CapabilityStrip.tsx
  - client/components/homepage/CtaSection.tsx
  - client/components/homepage/Equalizer.tsx
  - client/components/homepage/FeaturesSection.tsx
  - client/components/homepage/Footer.tsx
  - client/components/homepage/heroSection/HeroPlayerMock.tsx
  - client/components/homepage/heroSection/heroSection.module.css
  - client/components/homepage/heroSection/HeroSection.tsx
  - client/components/homepage/heroSection/HeroStationPlayer.tsx
  - client/components/homepage/heroSection/official.ts
  - client/components/homepage/heroSection/uptime.ts
  - client/components/homepage/HowItWorks.tsx
  - client/components/homepage/ListenerLibrary.tsx
  - client/components/homepage/LiveNow.module.css
  - client/components/homepage/LiveNow.tsx
  - client/components/homepage/navbar/MobileMenu.tsx
  - client/components/homepage/navbar/Navbar.tsx
  - client/components/homepage/navbar/UserMenu.tsx
  - client/components/homepage/PlanBadge.tsx
  - client/components/homepage/PricingSection.tsx
  - client/components/homepage/ProgrammeSection.tsx
  - client/components/homepage/StudioMock.tsx
  - client/components/homepage/StudioSection.tsx
  - client/components/homepage/WaitlistButton.tsx
  - client/components/homepage/WeekGridMock.tsx
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
  - client/components/dashboard/StationPower.tsx
  - client/components/dashboard/GoLiveTrigger.tsx
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
  - client/components/dashboard/StationChecklist.tsx
  - client/components/dashboard/CreateStationButton.tsx
  - client/lib/micPrefs.ts
  - api/database/migrations/2026_04_16_131050_create_plans_table.php
  - api/database/migrations/2026_09_02_100000_raise_plan_listener_caps.php
  - api/database/migrations/2026_08_15_115900_add_feature_columns_to_plans_table.php
  - api/database/migrations/2026_09_01_100000_add_analytics_days_to_plans_table.php
  - api/database/migrations/2026_09_08_100000_add_embed_enabled_to_plans_table.php
  - api/database/migrations/2026_09_15_140000_add_encoder_enabled_to_plans_table.php
  - api/resources/views/liquidsoap/station.blade.php
fingerprint: 96731db5e86ec961
---

# Marketing site, help centre and blog

The public, signed-out face of GoCast: the homepage, `/help` (17 task articles), `/blog` (6 essays), `/privacy`, `/terms`, the sitemaps and metadata, and the "request Pro / talk to us" form. Everything is hand-written React in `client/`. There is no CMS: an article is a `.tsx` file plus an entry in a registry array.

**The one thing people get wrong:** the copy is not generated from the product. Plan limits, button names and screenshots are typed by hand in about 30 places, so they drift. Section "Claims the code contradicts" lists what has drifted as of 2026-09-29. Help articles carry an `updated` date that nothing forces you to bump.

## Routing and layout

| URL | File | Notes |
|---|---|---|
| `/` | `client/app/(marketing)/page.tsx` | There is **no** `client/app/page.tsx`; the homepage lives in the `(marketing)` group. Calls `isAuthenticated()` and passes `isAuthed` to the hero and CTA. Canonical pinned to `/`. |
| `/blog`, `/blog/[slug]` | `(marketing)/blog/` | Index sorted by `date` descending. |
| `/help`, `/help/[slug]` | `(marketing)/help/` | Index grouped by category. |
| `/privacy`, `/terms` | `(marketing)/privacy`, `terms` | Static prose, "Last updated" typed in the page. |
| `/discover` | `(marketing)/discover/page.tsx` | **Dead.** `next.config.ts` redirects `/discover` to `/` (307) and the page itself also `redirect("/")`. `DiscoverFilters.tsx` and `loading.tsx` remain. |
| `/roadmap` | none | Permanent (308) redirect to `/` in `next.config.ts`. |

`(marketing)/layout.tsx` wraps every page in a dark shell, max width 1200px: `Navbar`, children, `Footer`. Auth, dashboard, station and embed pages are outside the group and have their own chrome.

`Navbar` (server component) calls `getSession()`. Links: How it works (`/#features`), Pricing (`/#pricing`), Blog, Help. Signed out it shows Sign in and Sign up; signed in it shows `UserMenu` (first name, Dashboard, Sign out via `useSignOut`). `MobileMenu` is a right-hand sheet below the `sm` breakpoint. `Footer`: Help, Blog, Terms, Privacy, contact `hello@gocast.fm` (questions) and `business@gocast.fm` (press), and X/Facebook/Instagram links. No link to `/discover`.

## Homepage sections (in order)

`HeroSection`, `HowItWorks` (`id="features"`), `StudioSection`, `ProgrammeSection`, `ListenerLibrary`, `LiveNow` (`id="live"`), `CapabilityStrip`, `PricingSection` (`id="pricing"`), `CtaSection`.

- **HeroSection** (async server component). Headline "Your voice. On air in 60 seconds." Fetches `GET {apiUrl}/public/stations/gocast-official-station` with `next: { revalidate: 30 }` and `publicApiHeaders()`; on any failure returns `null` and the player renders off-air. CTA: `/auth/register` "Create a free station", or `/dashboard` "Open dashboard" when authed; `TrustCues` only when signed out.
- **HeroStationPlayer** (client). Plays the real official station: `OFFICIAL_SLUG = 'gocast-official-station'` (`official.ts`), HLS URL constant `https://stream.gocast.fm/gocast-official-station/aac.m3u8` (used unless `station.hls_url` is present), artwork `/official-station-512.png` from `/public`. Silent until clicked. hls.js config: `backBufferLength: 30`, `liveSyncDurationCount: 2`, `pLoader: createPlaylistLoader`. Ladder: manifest 404 marks the station failed/off air; other network errors go to `createNetworkRecovery`; media errors `recoverMediaError`; anything else falls to Icecast (`env.icecastUrl + station.icecast_mount`, only when the API answered). Safari uses native HLS. Polling via `usePublicStationFeed` and listener counting via `useListenerSession` are both gated on `playing`, so bounce visitors cost no polling. Badge states: Off air (`failed` or API says not on air), Live, On air; unknown counts as On air (optimistic, by design).
- `uptime.ts` (`formatUptime`, "Nd on air") is exported but **not imported anywhere** in the files in scope; dead.
- **HowItWorks**: three static steps (Create your station, Go on air, Share your link) with times "15 seconds", "1 click", "Instant".
- **StudioSection + StudioMock**: static mock of the on-air deck, shortcut row Space, K, N, P, R, and three bullet points. Badge Free.
- **ProgrammeSection + WeekGridMock**: static mock week grid (fixed slots Morning Coffee, Drivetime, Weekend Brunch, Late Night; the last wraps midnight and is split into two segments), three bullets, badge Pro.
- **ListenerLibrary**: client-only, reads `getSaved()` / `getHistory()` from `lib/listenerLibrary` (localStorage). Renders nothing until hydrated and nothing when both lists are empty; up to 4 saved and 4 recent (recent excludes saved).
- **LiveNow** (server): `GET /public/featured`, revalidate 30. Returns `null` when the list is empty, so the section vanishes. The API returns at most `Station::FEATURED_RAIL_SIZE = 4` stations that are featured and running, live-broadcast first (`PublicStationController::featured`). Badge "Live" if `is_live`, else "On air". Features are set by admins (`featured` scope; see [admin-panel](admin-panel.md)).
- **CapabilityStrip**: four Pro items (stream URL, own domain/embed, own gear, listener history). See contradictions.
- **PricingSection**: Free card (8 bullets, `/auth/register`), Pro card ("Free in beta, then $15/mo", `PRO_PRICE_USD` from `interfaces/Plan.ts`, no button, prose says request from the dashboard), Custom card with `WaitlistButton`. Footer text "Pricing last updated 21 September 2026" is a typed constant `LAST_UPDATED`.
- **CtaSection**: `/auth/register` "Start broadcasting free", or `/dashboard/stations` "Open dashboard" when authed (the hero sends authed users to `/dashboard`; the two differ).

### Dead components in scope

`FeaturesSection.tsx`, `heroSection/HeroPlayerMock.tsx` and `homepage/Equalizer.tsx` are not imported by any file (checked by grep). `FeaturesSection` is the old nine-card grid whose claims (TuneIn/Sonos, own domain) are still copied into `CapabilityStrip`. `LiveNow.tsx` has its own private `Equalizer` and CSS module.

## The request form (waitlist)

- `WaitlistButton` opens `ProAccessDialog` (`client/components/ProAccessDialog.tsx`), passing `plan`. Only the Custom card on the homepage uses it now.
- The dialog has two modes keyed on `plan === "pro"`. **Custom** (public): fields email, link, message; `POST /waitlist` with `{email, plan, social, message}`. **Pro** (signed in, mounted once for the whole dashboard by `client/contexts/ProRequestContext.tsx`; opened from the sidebar "Request" button and `GoLiveTrigger`, never from the homepage): `POST /waitlist/pro` with `{social, message}`; the server reads email and plan from the session.
- Client validation: email regex (custom only); `social` must contain a `.` ("full link"); `message` max 2000, `social` max 255. Errors: 401 session expired, 429 "Too many attempts", 422 "check the details", else generic.
- API (`api/routes/api.php`): `POST /waitlist` sits under `throttle:3,60` (3 per IP per hour), unauthenticated. `POST /waitlist/pro` is `auth:sanctum` only, deliberately outside `verified`.
- `StoreWaitlistRequest`: `plan` must be `custom` (`PUBLIC_PLANS`), so posting `pro` publicly is a 422. `social` required, max 255; `message` nullable max 2000; `email` required, max 255.
- `WaitlistController::record` does `updateOrCreate(['email','plan'], ...)`: resubmitting overwrites social/message. A `rejected` row is reopened to pending; an `approved` row is left alone. Responds 201 `{message: "Request received."}`.
- `WaitlistEntry` has statuses pending/approved/rejected, `$fillable` excludes review columns. `isGrantable()` is true only for a pending row with a `user_id`, so Custom rows (no `user_id`) are never grantable. Model events call `AdminTelegram::accessRequested` (registered in `AppServiceProvider`), which is inert without `TELEGRAM_BOT_TOKEN`. Review UI is in [admin-panel](admin-panel.md); granting is in [accounts-plans-invites](accounts-plans-invites.md).
- API tests: `api/tests/Feature/WaitlistControllerTest.php`.

## Help centre

**Registry:** `help/_content/articles.ts` exports `HELP_ARTICLES` (17), `CATEGORIES` (5), `getHelpArticle`, `articlesInCategory`, `relatedArticles` (drops unknown slugs silently). An article is `{slug, title, description, category, updated, Body, pro?, related?}`. `Body` is a React component from its own `.tsx` file.

**Rendering:** `help/[slug]/page.tsx` uses `generateStaticParams` from the registry; an unknown slug calls `notFound()`. Metadata: title `absolute: "<title> — GoCast Help"` (absolute because the root template appends "— GoCast"), canonical `/help/<slug>`, OG type `article`, twitter card, image `DEFAULT_OG_IMAGE`. JSON-LD `@graph`: `TechArticle` (with `dateModified: updated`, deliberately no `datePublished`) plus `BreadcrumbList` Home > Help > article. Page furniture: back link, category eyebrow, a "This one needs Pro" note when `pro` (linking to `/help/free-and-pro`), `Prose`-wrapped body, "Read next" cards, and a "Still stuck?" box with `mailto:hello@gocast.fm`. The `updated` field is **not shown**; it feeds JSON-LD and the sitemap only.

**Index:** `help/page.tsx`, one page, no search or pagination. Pro articles show a sparkle icon. It tells people to email **`support@gocast.fm`**, whereas every other surface uses `hello@gocast.fm`.

### Articles

Slug, title, category, Pro flag, `updated`, and what it claims.

| Slug | Title | Cat | Pro | Updated | Claims |
|---|---|---|---|---|---|
| create-your-account | Create your account | getting-started | no | 09-21 | Google or email+code; unverified accounts can sign in and edit their account but cannot create a station, upload or go on air; no card. |
| create-your-station | Create your station | getting-started | no | 09-21 | Name, address, artwork, description; "one station on Free, up to five on Pro"; new station is off air; checklist disappears when done. |
| your-player-page | Your player page | getting-started | no | 09-23 (body edited after) | Page at `/station/<slug>`; player, artwork, show times (set under "Show times" in Station settings), share/social links; off-air state shows only a notify-email field; show times are advertising only, AutoDJ slots are on the Schedule page. |
| free-and-pro | What you get on Free and on Pro | getting-started | no | 09-23 | Table: listeners 100/1,000; AutoDJ 3 GB Pro; playlists+scheduling Pro; encoders Pro; embed Pro; audience history "live count only"/90 days; $15/mo, free in beta; lapse deletes nothing. |
| turning-your-station-on-and-off | Turning your station on and off | going-live | no | 09-21 | Power vs source; status table (Off air, Starting, Live, On air, Checking/Status unknown, Not reaching listeners); buttons Go live / Start AutoDJ / Turn station off; going live starts the station; auto-stop after ten minutes. |
| go-live-from-your-browser | Go live from your browser | going-live | no | 09-21 | Steps; "about fourteen seconds" delay; what ends a broadcast (tab close, reload, links out); reconnect survives wifi hiccups; phone rule; ~10s tail after stop. |
| using-the-studio | Using the studio | going-live | no | 09-21 | Mic meter, file queue (Repeat list/track, local only), push-to-talk ducks music to "a fifth", Keep mic on / L, monitor excludes mic, encoder health "N s lost". |
| broadcast-from-butt-or-mixxx | Broadcast from BUTT, Mixxx or RadioDJ | going-live | yes | 09-21 | Icecast 2 protocol; five values, username always `source`; not Shoutcast, not OBS; encoder does not switch the station on; one broadcaster at a time. |
| upload-your-music | Upload your music | autodj | yes | 09-21 | MP3/M4A/AAC/FLAC/OGG/WAV (API also accepts `mpga`); 300 MB per file (`max:307200` KB); 30 files per request (`files` max 30, also `MAX_BATCH_FILES` client-side, which additionally splits batches at 500 MB); 3 GB per station shared with jingles; lands in default playlist; jingles are random, on a timer. |
| playlists-and-the-rotation | Playlists and the rotation | autodj | yes | 09-21 | Track in many playlists, counted once; per-playlist position memory; per-playlist shuffle without repeats; one undeletable default playlist. |
| schedule-playlists-by-time | Schedule playlists by day and time | autodj | yes | 09-21 (body edited after) | Week grid, one row per day (drag to draw, drag edge changes one day, Save button); slots crossing midnight; slot starts at next track boundary; timezone set under Show times in Station settings and only shown on Schedule; not the same as show times, which "appear on the week view as green marks" (`WeekGrid` draws them as dashed `SHOW` marks in the `live` colour, linking to settings). It says the slot is edited "in the panel beside it"; `SlotPanel` is the body of a Dialog. Detail in [schedule](schedule.md). |
| share-your-station | Share your station | listeners | no | 09-21 (body edited after) | Link, QR ("Tune-in code"), link previews, notify-me email, show times in settings. |
| embed-the-player | Embed the player on your site | listeners | yes | 09-21 | Embed via share card or studio stream panel; needs Pro; lapse stops rendering. |
| read-your-audience-page | Read your audience page | listeners | yes | 09-21 | 7/30/90 day windows; chart is listening time; breakdowns; not live/AutoDJ split; today underestimated; Free sees live count only. See [listener-analytics](listener-analytics.md). |
| nobody-can-hear-my-station | Nobody can hear my station | troubleshooting | no | 09-21 | Wait ~15 s; mic meter; encoder health; "Not reaching listeners" is our fault. |
| my-encoder-wont-connect | My encoder will not connect | troubleshooting | yes | 09-21 | Five causes: Shoutcast type, `http://` in server field, station off, mount slashes, another source connected; plus username, plan, rotated key, network. |
| my-station-went-off-air | My station went off air on its own | troubleshooting | no | 09-21 | Stops after ten minutes of silence with nothing attached; listener count is irrelevant; muted mic does not count. |

"(body edited after)": commit 360c382 rewrote these three bodies (`schedule-playlists-by-time`, `share-your-station`, `your-player-page`) for the week grid and for show times moving to Station settings, but left `articles.ts` alone, so their `updated` dates (09-21, 09-21, 09-23) are stale.

**Dashboard links into help** (`components/dashboard/HelpLink.tsx`, always `target="_blank"` so a click cannot end a live broadcast): `playlists-and-the-rotation` (2), `read-your-audience-page` (2), `schedule-playlists-by-time`, `turning-your-station-on-and-off`, `upload-your-music`. Plain links to `go-live-from-your-browser` (live page), `using-the-studio` (StreamPanel), `my-encoder-wont-connect` (EncoderConnection). The sidebar links to `/help`.

## Blog

**Registry:** `blog/_content/articles.ts` exports `ARTICLES` (6) and `getArticle`. Fields: `slug, title, description, date, updated?, readingTime, metaDescription?, image?, Body, faqs?`. `metaDescription` is preferred over `description` for meta and OG.

**Rendering:** `blog/[slug]/page.tsx`: static params, `notFound()` for unknown, title via the root template ("<title> — GoCast"), OG `publishedTime`/`modifiedTime`, image `article.image` (no dimensions) or `DEFAULT_OG_IMAGE`. JSON-LD: `Article` (datePublished, dateModified, image, Organization author/publisher, logo `/logo.png`) plus `FAQPage` built from `faqs`. Visible byline shows date, "Updated", reading time. Hero rendered with `ZoomableImage` (1200x630 declared, `preload`). Footer box "Ready to start your station?" links to `/auth/register`. The blog index (`blog/page.tsx`) uses `pageMetadata` and emits no JSON-LD.

| Slug | Title | Date | Claims |
|---|---|---|---|
| broadcasting-from-your-phone | Broadcasting Radio From Your Phone | 2026-09-27 | Studio keeps screen awake (wake lock), reconnects for up to two minutes (`RECONNECT_BUDGET_MS = 120000` in `client/lib/broadcast.ts`), push-to-talk releases on focus loss; locking/app switch/call stops the broadcast; free station off after ~2.5 min; "an app is being built". |
| how-to-schedule-playlists-on-your-radio-station | How to Schedule Playlists... | 2026-09-21, hero `/blog/schedule/hero.webp` | Launch post for playlists and weekly slots; 50 slots max; slot changes at track boundary; overlaps refused; Pro. Setup steps were updated in 360c382 for the week grid (Schedule from the sidebar, timezone under the week view, set in Station settings); the screenshots are still of the old list editor and the save step still says "Save AutoDJ slots" (the button in `SchedulePlanner.tsx` reads "Save"). |
| how-does-an-internet-radio-station-work | How an Internet Radio Station Actually Works | 2026-09-01 | Four jobs; 100 vs 1,000 listeners; self-hosting comparison; silent station "switches itself off within a couple of minutes". |
| how-much-does-it-cost-to-run-an-internet-radio-station | What It Actually Costs... | 2026-09-01 | Licensing, bandwidth (58 MB per listener-hour at 128 kbps), competitor prices; Pro $15, free in beta. |
| keep-your-radio-station-on-air-24-7 | How to Keep Your... On Air 24/7 | 2026-09-01 | AutoDJ launch post, Free vs Pro table, how to request Pro. |
| how-to-start-an-internet-radio-station-2026 | How to Start an Internet Radio Station in 2026 | 2026-05-01, updated 2026-08-31, hero `/blog/how-to-start-...webp` | Long guide, platform comparison. GoCast passages checked against code: Free = one station, 100 listeners, no card; Pro $15, 3 GB, encoder ingest, 1,000 listeners, analytics all match the plan rows, but the same passage promises "a custom domain" and a TuneIn/Sonos stream URL (contradictions 1-2) and says Free "deliberately needs you at the browser". Generic industry text (licensing, competitor prices, listener-count benchmarks) is not GoCast-verifiable and was not checked. |

Images: `client/public/blog/schedule/{hero,library,on-now,rotation,slots,week}.webp` (all dated 2026-09-21), `client/public/blog/how-to-start-an-internet-radio-station-2026.webp`.

## Screenshots

**Where used:** help articles reference `/help/*.webp` through `ZoomableImage` with explicit `width`/`height`, and a long `alt` that describes the image. Files in `client/public/help/`: audience-breakdowns, audience-chart, autodj-rotation, encoder-connection, music-library, player-now-playing, player-page, schedule-on-now, schedule-slots, schedule-week, share-qr, station-header, station-power. All were written 2026-09-21 22:03. `ZoomableImage` (`components/content/ZoomableImage.tsx`) is a button with a Radix `Dialog` lightbox; second click toggles fit vs 1:1.

**How they are produced:** `client/tests/e2e/help-screenshots.spec.ts` (Playwright, 2x device scale, 1680x1050 viewport). It signs in as a hard-coded dev account, expects a "dressed" dev database whose station slug is `test`, visits dashboard pages, and writes **PNG** to `client/tests/e2e/.screenshots/`. Converting to `.webp` and copying into `public/help/` is manual; no script does it. It also captures `go-live-preflight` and `player-page` outputs; `go-live-preflight` is not referenced by any article.

**Stale screenshots and a stale spec (2026-09-29):**
- `station-power.webp` shows "Take over live" and "Take off air"; the UI now says "Go live" and "Turn station off" (`StationPower.tsx`). The article's alt text repeats the old names.
- `schedule-slots.webp` shows the old one-row-per-slot list editor with day chips; the Schedule page is now a week grid with a slot dialog. The spec's selectors for it (`placeholder "Label (optional)"`) no longer exist (`SlotPanel` uses "e.g. Breakfast"). `schedule-on-now.webp` targets text "ON NOW", which no longer exists (`ScheduleStatus.tsx` says "<name> is playing."). Only the `THIS WEEK` selector still matches (the `<h2>` "This week").
- The go-live step waits for "You're about to go live on", which the live page no longer renders, so it would time out.
- Blog `/blog/schedule/*` shots are the same old editor.
- The spec's header comment says it is "kept out of the normal run by its `@screenshots` tag". It is not: `playwright.config.ts` has no `grep`/`grepInvert`, and `npm run test:e2e` is plain `playwright test`, so it runs with the suite (and fails without the dressed DB).

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

Both are static JSX with a typed "Last updated" line: privacy **September 26, 2026**, terms **September 8, 2026**. Contacts: `privacy@`, `legal@`, `dmca@gocast.fm`. Privacy lists Google OAuth, Sentry (~2% of sessions replayed, half of error sessions), Google Analytics, Umami, Microsoft Clarity, Resend, Cloudflare; cookies `token` (HttpOnly, 30 days), `user`, `sidebar_state`; listening sessions deleted after 90 days; deleted stations kept 30 days. These were not audited against the API; they are copy. Terms section 6 and 4 disagree with each other (below).

## Shared components

- `Prose` (`components/content/Prose.tsx`): the Tailwind `prose prose-invert` wrapper (max 68ch) used by both blog and help; renders an `<article>`.
- `TrustCues` (`components/common/TrustCues.tsx`): "Browser-based", "Private until shared", "Free forever"; `compact` in hero and CTA, `stacked` on the register page.
- `PasswordInput`: show/hide eye, used by auth pages and dashboard settings.
- `PlanBadge`: Free/Pro pill for section eyebrows.

## Claims the code contradicts

Checked against code on 2026-09-29.

1. **Custom domain.** `CapabilityStrip`, `FeaturesSection`, the Pro pricing bullet ("Embed your player, on your own domain"), the 24/7 post table ("Your own domain and listener stats") and the how-to-start post ("a custom domain") promise "point a DNS record at your station". There is no custom-domain code in the API or client (grep for domain/CNAME finds only these marketing files).
2. **TuneIn/Sonos stream URL as a Pro feature.** Same files plus the 24/7 post's table. No dashboard surface shows a public listen URL to owners; the settings page shows only the encoder mount. Nothing gates a public stream by plan: `StationResource` exposes `icecast_mount` and `hls_url` to anyone, and the native kit fronts Icecast with TLS (`infra/native/nginx/gocast-icecast.conf`). Whether that mount is reachable on the live host is a deployment fact that cannot be read from code.
3. **"Priority support"** (Pro bullet): no code or process behind it.
4. **Stations per plan.** `create-your-station` says Pro can run "up to five"; `plans.max_stations` is 5 and `StoreStationRequest::authorize` enforces it, but the dashboard is single-station (`getMyStation()` picks the oldest; `/dashboard` shows only "Create station" with none). A second station is not reachable from the UI. Terms section 6 also mentions station-count limits. `ProAccessGranted` documents the column as stale.
5. **Station address.** `create-your-station` lists "An address" under "What you are asked for" (while saying it is built from the name) and warns that "changing it later breaks every link". The create form has no address field (it is generated from the name by `Station::generateUniqueSlug`), the slug is immutable (`UpdateStationRequest` comment), and the edit form only displays it.
6. **Onboarding checklist.** Help says artwork, description, "your first broadcast". Real items (`StationChecklist.tsx`): artwork, description, fill default playlist (Pro only), set show times, social links, "Get your first listener".
7. **Studio delay "about fourteen seconds"** (`go-live-from-your-browser`, `nobody-can-hear-my-station`). The harbor buffer was cut to `buffer=5.` (`station.blade.php`), with a 2 s `live_raw` buffer and 4 s HLS segments. The 14 s figure predates the cut; the true number was not measured here.
8. **Ducking "to a fifth".** Only the default. `micPrefs.ts` has three duck levels (`under` 0.2, `low` 0.08, `silence` 0), fade speeds and a "broadcast voice" option; no help article describes the mic settings popover.
9. **Pro gating of playlists/scheduling.** `free-and-pro` says these need Pro. Server enforcement is at upload (`TrackController::store` via `assertAutoDjEnabled`), jingle enabling, and playback (`AutoDjScheduler`). `PlaylistController` and `AutodjSlotController` are explicitly not plan-gated. The clients do gate the door: `AppSidebar.tsx` gives both the AutoDJ and the Schedule items `lock: "autodj"` (a Pro badge for locked accounts), and the mobile schedule screen skips its playlist fetch when locked.
10. **"Request access in the sidebar"** (24/7 post): the sidebar button reads "Request" + Pro badge; "Request access" is the label in `GoLiveTrigger` and the dialog submit.
11. **Scheduling "What's Coming Next"** (24/7 post) says scheduled shows are being built; slots shipped (the 09-21 post). The same post's "workaround" text is obsolete.
12. **Schedule blog post.** Its steps were edited in 360c382 for the week grid, but still tell people to press "Save AutoDJ slots" (the button in `SchedulePlanner.tsx` is "Save"), and the `/blog/schedule/*` screenshots show the deleted `AutodjSlotsEditor`. "Add slot" and overlap warnings do still exist.
13. **Auto-stop timing.** Help says ten minutes: correct for the default (`LIQUIDSOAP_SILENT_STOP_SECONDS` 600). But a studio that leaves stops the station after `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` (150), so the how-it-works post's "within a couple of minutes" is right only for that case, and `go-live-from-your-browser` says "shortly afterwards" without a number. The `my-station-went-off-air` article does not mention the 150 s path.
14. **"Private until shared"** (`TrustCues`, shown on hero, CTA and register) versus terms section 4 ("every station on GoCast is public... listed in our public directory, featured on our homepage") and the station sitemap that publishes any station that has ever run. Terms is closer to the code.
15. **Terms 6 vs 4.** Section 6 says Free plans "carry an audible GoCast identifier in the stream"; section 4 says it is not done today. `plans.watermark_enabled` is true for Free but the clip directory is empty, so it is inert (see [watermark-clips](watermark-clips.md)). `interfaces/Plan.ts` says never to surface it.
16. **Sitemap vs page dates.** `sitemap.ts` stamps privacy and terms `2026-09-08`; the privacy page says September 26. The comment says to bump both together.
17. **Contact address split.** Help index uses `support@gocast.fm`; footer, article footers and JSON-LD use `hello@gocast.fm`.
18. **`updated` not bumped** on the three help bodies rewritten in 360c382 (see article table).
19. **Homepage CTA target** differs by section (`/dashboard` in hero, `/dashboard/stations` in CTA); both redirect to the one station.
20. **Listener caps are display-only.** Every surface says 100 (Free) / 1,000 (Pro) concurrent listeners, but `plans.max_listeners` is read only to print it (`UserResource`, notifications, admin views, settings page); nothing in `api/app` or the station script refuses a listener over it. The only cap in the infra is the Icecast global `<clients>500</clients>` in `infra/native/icecast/icecast.xml.tpl`.
21. **Blog phone post** says a GoCast app is "being built for iPhone and Android"; an Android app exists in the working tree ([mobile-app-shell-and-auth](mobile-app-shell-and-auth.md)); copy not updated.

## Gaps and traps

- No client test covers any marketing page, article registry, JSON-LD or sitemap. The only client specs are `auth.spec.ts` and the screenshot spec. On the API side, `PublicStationSeoTest.php` and `PublicFeaturedTest.php` cover the station sitemap and featured endpoints.
- A new article needs: the `.tsx` body, an import and entry in the right `articles.ts`, and (help only) `related` slugs. The sitemap and static params derive from the registry; nothing else needs touching. Nothing validates slugs or `related`; unknown `related` slugs vanish silently.
- Help bodies must not contain a bare `</strong> word` across a wrapped line: use `{" "}` (see the existing `<strong>...</strong>{" "}` pattern).
- Pricing numbers are duplicated: `PricingSection` (`FREE_FEATURES`, `PRO_FEATURES`, `LAST_UPDATED`), `free-and-pro` table, four blog posts, FAQ arrays in `articles.ts` (which are emitted as `FAQPage` JSON-LD, so they must match the visible body), and the DB `plans` rows (100/1,000 listeners, 90 days, 3 GB is `LIQUIDSOAP_STATION_STORAGE_BYTES`). Only `PRO_PRICE_USD` is shared in code.
- `PRO_AVAILABLE = false` in `interfaces/Plan.ts` means there is no checkout. All "upgrade" paths are request forms.
- The hero depends on a real station `gocast-official-station` existing and streaming from `stream.gocast.fm`; if the API is down the card falls back to a plausible "On air" state until play fails (documented optimistic default).
- `/discover` redirect exists in two places (config and page); removing only one leaves it redirected.
- Dead code listed above (`FeaturesSection`, `HeroPlayerMock`, `Equalizer`, `uptime.ts`, `discover/*`).
- `help-screenshots.spec.ts` contains a hard-coded dev sign-in; do not point it at a shared environment.

## Tests

Client: none. API: `PublicStationSeoTest.php`, `PublicFeaturedTest.php` (the endpoints the sitemap and rail read) and `api/tests/Feature/WaitlistControllerTest.php` (public/Pro request, upsert, reopen after reject, approved untouched, Pro plan refused on the public endpoint) and Telegram/admin tests for the queue. `client/tests/e2e/help-screenshots.spec.ts` is a screenshot generator, not a test.

## History

Plans and handoffs (history only): `docs/AUTODJ-SCHEDULING-HANDOFF.md` (schedule blog and help), `docs/GROWTH-FEATURES-2026-09-23.md` (SEO ideas), `docs/CASTER-FM-GAP-ANALYSIS.md`. Related feature docs: [schedule](schedule.md), [public-player-and-embed](public-player-and-embed.md), [accounts-plans-invites](accounts-plans-invites.md), [listener-analytics](listener-analytics.md).
