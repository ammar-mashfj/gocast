---
feature: Public player page, Pro embed and listener-facing SEO
verified: 2026-10-01 against f6a201c plus uncommitted work (dashboard design-system rollout R1–R6.3)
sources:
  - client/app/station/[slug]/page.tsx
  - client/app/station/[slug]/getStation.ts
  - client/app/station/[slug]/PlayerView.tsx
  - client/app/station/[slug]/ScheduleBlock.tsx
  - client/app/station/[slug]/NotifyMeForm.tsx
  - client/app/station/[slug]/RelatedStations.tsx
  - client/app/station/[slug]/opengraph-image.tsx
  - client/app/station/[slug]/twitter-image.tsx
  - client/app/station/[slug]/player.module.css
  - client/app/station/sitemap.ts
  - client/app/embed/[slug]/page.tsx
  - client/app/embed/[slug]/EmbedPlayer.tsx
  - client/app/hls-proxy/[...path]/route.ts
  - client/app/(marketing)/discover/page.tsx
  - client/app/(marketing)/discover/DiscoverFilters.tsx
  - client/app/(marketing)/discover/loading.tsx
  - client/app/sitemap.ts
  - client/app/robots.ts
  - client/app/manifest.ts
  - client/app/layout.tsx
  - client/app/not-found.tsx
  - client/proxy.ts
  - client/next.config.ts
  - client/lib/seo.ts
  - client/lib/embed.ts
  - client/lib/share.ts
  - client/lib/socialLinks.ts
  - client/lib/public-api.ts
  - client/lib/hlsPlaylistLoader.ts
  - client/lib/hlsRecovery.ts
  - client/lib/env.ts
  - client/hooks/useStreamPlayback.ts
  - client/hooks/useListenerSession.ts
  - client/hooks/usePublicStationStats.ts
  - client/components/dashboard/EmbedDialog.tsx
  - client/contexts/AccountContext.tsx
  - client/.env.example
  - api/routes/api.php
  - api/app/Http/Controllers/PublicStationController.php
  - api/app/Http/Controllers/PublicEmbedController.php
  - api/app/Http/Controllers/StationNotifyController.php
  - api/app/Http/Controllers/ListenerCountController.php
  - api/app/Http/Controllers/ListenerSessionController.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Requests/UpdateStationRequest.php
  - api/app/Models/Station.php
  - api/app/Models/StationNotifySubscription.php
  - api/app/Models/User.php
  - api/app/Services/ListenerAnalytics.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Jobs/SendStationLiveNotifications.php
  - api/config/services.php
  - api/config/liquidsoap.php
  - api/config/analytics.php
  - infra/native/nginx/gocast-stream.conf
  - infra/native/nginx/gocast-api.conf
  - api/tests/Feature/PublicEmbedTest.php
  - api/tests/Feature/PublicStationSeoTest.php
  - api/tests/Feature/StationNotifySubscriptionTest.php
  - client/components/dashboard/overview/YourLinkCard.tsx
  - client/components/dashboard/share/TuneInCodeDialog.tsx
  - client/components/dashboard/share/ShareDialog.tsx
  - client/app/dashboard/stations/[slug]/settings/LinksCard.tsx
  - client/app/dashboard/stations/[slug]/settings/StreamCard.tsx
fingerprint: 29b345d03407688f
---

# Public player page, Pro embed and listener-facing SEO

Everything a listener (or a crawler) touches: the full player page at `/station/{slug}`, the Pro-only iframe player at `/embed/{slug}`, the share images, sitemaps and robots rules, and the dashboard pieces that hand out the link, QR code, embed snippet and social links. The page is server-rendered from the public API, plays audio over **HLS first with an Icecast fallback**, and reports each playing browser to the listener-analytics endpoints.

The thing people get wrong: **the embed gate lives in the API, not in the page or in headers.** `/embed/{slug}` is a plain public URL that only renders because `GET /public/stations/{slug}/embed` answers 200 for a Pro owner; free stations get a 404 that looks exactly like an unknown slug. And the player page itself is *never* gated by plan: a Free station's `/station/{slug}` works fully, only its `<meta robots>` may say `noindex` (see Indexing).

Related docs: [Listener analytics](listener-analytics.md) (what the session endpoints do with the token), [Notifications and email](notifications-and-email.md) (what happens after someone subscribes to notify-me), [Station lifecycle](station-lifecycle.md) (what makes `is_on_air` true), [Accounts, plans, invites](accounts-plans-invites.md) (where `embed_enabled` comes from), [Schedule](schedule.md) (the "Weekly schedule" sheet's data), [Liquidsoap station script](liquidsoap-station-script.md) (HLS encoder).

## Routes at a glance

| URL | File | Notes |
|---|---|---|
| `/station/{slug}` | `client/app/station/[slug]/page.tsx` | SSR, full player |
| `/station/{slug}/opengraph-image`, `/twitter-image` | `opengraph-image.tsx`, `twitter-image.tsx` | Composed 1200x630 PNG; the twitter file just re-exports the OG one |
| `/station/sitemap.xml` | `client/app/station/sitemap.ts` | Indexable stations only |
| `/sitemap.xml` | `client/app/sitemap.ts` | Marketing pages, blog, help; no stations |
| `/robots.txt` | `client/app/robots.ts` | |
| `/manifest.webmanifest` | `client/app/manifest.ts` | Site-wide PWA manifest, not per station |
| `/embed/{slug}` | `client/app/embed/[slug]/page.tsx` | Pro only (via API 404) |
| `/hls-proxy/*` | `client/app/hls-proxy/[...path]/route.ts` | **Dev only**; 404 unless `NODE_ENV === "development"` |
| `/stream-proxy/*` | rewrite in `next.config.ts` | Dev only; proxies to local Icecast (`INTERNAL_ICECAST_URL`, default `http://127.0.0.1:8888`). Rewrites return `[]` outside development |
| `/discover` | `client/app/(marketing)/discover/page.tsx` | Redirects to `/` (see Gaps) |

## Data source: the public API

All endpoints are unauthenticated, in `api/routes/api.php` under `throttle:public` unless noted. Payloads are `StationResource` (`api/app/Http/Resources/StationResource.php`).

| Endpoint | Controller | Used by |
|---|---|---|
| `GET /public/stations/{slug}` | `PublicStationController::show` | Player page, OG image. Eager-loads `schedules`, `withIndexability()`. 404 via `firstOrFail`, for **any** station regardless of state |
| `GET /public/stations/{slug}/embed` | `PublicEmbedController::show` | Embed page. 404 unless `$station->user->canEmbed()` |
| `GET /public/stations/{slug}/listeners` | `ListenerCountController::show` | The 10s feed (count, `is_live`, `is_on_air`, `now_playing`) |
| `POST /public/stations/{slug}/notify` | `StationNotifyController::store` | Notify-me box. Extra `throttle:5,60` (5 per hour per IP) on top of `public` |
| `GET /public/sitemap/stations` | `PublicStationController::sitemap` | Stations sitemap. Placed outside `/public/stations/` so it cannot shadow a station slugged "sitemap" |
| `GET /public/featured` | `PublicStationController::featured` | `RelatedStations` (dead, see Gaps) and the homepage rail |
| `GET /public/stations`, `GET /public/genres` | `index`, `genres` | Only the dead Discover page |
| `POST /public/stations/{slug}/listen`, `POST /public/listen/{token}/beat`, `/end` | `ListenerSessionController` | `useListenerSession`. **Not** in the `public` bucket; own limiters (below) |

### StationResource fields the player relies on

`name, slug, description, genre, timezone, artwork_url, featured, is_live, is_on_air, now_playing {title, artist}, icecast_mount, hls_url, social_links, schedules (only when loaded), indexable (only when withIndexability was loaded, i.e. only on the public show endpoint), user_id`.

- `is_on_air` is `$station->isRunning()`, i.e. **owner intent** (`desired_state = running`). It says nothing about whether the container is actually healthy; that is what the 10s feed (`ListenerCountController`, which asks the container) corrects.
- `is_live` = running AND an open `StreamSession` (a human broadcaster). AutoDJ is on air but not live.
- `hls_url` = `{LIQUIDSOAP_HLS_BASE_URL}/{slug}/{LIQUIDSOAP_HLS_VARIANT}.m3u8` (variant default `aac`). It is the **media** playlist, not `playlist.m3u8`, so per-listener query strings survive. Null when `LIQUIDSOAP_HLS_BASE_URL` is empty; the player then uses Icecast only.
- `icecast_mount` defaults to `/stream/{slug}` (set in `Station` boot); the client builds the audio URL as `NEXT_PUBLIC_ICECAST_URL + icecast_mount`.
- `watermarked` and `encoder` are owner-only and absent for anonymous requests.
- `user_id` **is** public. The page uses it for the owner chip (below).

## Player page: what it does

### Server side (`page.tsx`, `getStation.ts`)

- `getStation(slug)` (React `cache`d, so `generateMetadata`, the page and the OG image share one fetch) calls `GET /public/stations/{slug}` with `publicApiHeaders()` (adds `X-Render-Key` if `RENDER_API_KEY` is set). Production: `next: { revalidate: 60 }`. Development: `cache: "no-store"`, 3s abort, two attempts (undici stale keep-alive socket workaround).
- **404 vs 5xx is deliberate.** Only an API 404 returns `null` (page calls `notFound()`); any other status or a network failure **throws**, so crawlers get a 5xx and retry rather than a 404 that would drop the page from the index.
- Owner detection: `page.tsx` reads the `user` cookie (URL-encoded JSON) and sets `isOwner = user.id === station.user_id`. It is a display convenience only (shows the "You own this - Open studio" chip linking to `/dashboard/stations/{slug}`). It trusts an unsigned cookie; nothing sensitive hangs off it.
- Metadata (`generateMetadata`): title `"{name} — Live on GoCast"` set as `absolute` (bypasses the root template); description = station description flattened and cut to 160 chars at a word boundary (`metaDescription`, `client/lib/seo.ts`), or a generated "Tune in to ..." sentence; canonical `{NEXT_PUBLIC_APP_URL}/station/{slug}`; Open Graph type `music.radio_station`; Twitter `summary_large_image`, site `@gocastfm`. No `images` are set on purpose: the file-based `opengraph-image.tsx`/`twitter-image.tsx` win.
- A missing station yields title "Station not found" with `robots: {index:false, follow:true}`, plus the real 404 from `notFound()` (root `app/not-found.tsx` also sets noindex).
- JSON-LD: one `@graph` with a `RadioStation` (name, url, description, artwork as `image`/`logo`, `genre`, `broadcastService`; `broadcastFrequency: "Online"` only when `is_on_air`) and a `BreadcrumbList` (Home > station). `<` is escaped as `<`.
- The page is server-rendered (`PlayerView` is a client component but rendered in the SSR HTML), so crawlers and link unfurlers see the h1 and description.

### Indexing rule

Single definition in `Station::scopeIndexable` / `isIndexable` (`api/app/Models/Station.php`): **desired_state is running, OR the station has any `streamSessions` row, OR any `listenerStats` row.** Never-started stations are not indexable.

- The sitemap endpoint uses `->indexable()`, ordered by slug, capped at **50,000** rows, returning `slug` and `updated_at` only.
- The show endpoint returns `indexable` (via `withIndexability()` EXISTS columns). `page.tsx` adds `robots: {index:false, follow:true}` only when `station.indexable === false` (strict `=== false`, so a payload without the field is treated as indexable).
- The page stays reachable and playable when not indexable (owners share it before their first broadcast).
- List endpoints (`index`, `featured`) omit `indexable`; tested in `PublicStationSeoTest`.

### Sitemaps and robots

- `client/app/station/sitemap.ts`: `force-dynamic`, one fetch of `/public/sitemap/stations` with `next: { revalidate: 3600 }`. **Throws** on non-OK (an empty sitemap would tell crawlers everything is gone). Entries: `changeFrequency: "daily"`, `priority: 0.8`, `lastModified` from `updated_at` when present.
- `client/app/sitemap.ts`: home (priority 1, weekly), `/blog` and `/help` (0.6, weekly, lastmod = newest article), `/privacy`, `/terms` (hard-coded `2026-09-08` lastmod, yearly, 0.3), every article and help article from the registries (`monthly`, 0.7 / 0.5). Home has no lastmod on purpose.
- `robots.ts`: `User-agent: *`, allow `/`, disallow `/dashboard/`, `/api/`, `/monitoring` (Sentry tunnel), `/hls-proxy/`, `/stream-proxy/`. `/auth/` and `/embed/` are deliberately **not** disallowed so their noindex meta can be read. Sitemaps: `/sitemap.xml` and `/station/sitemap.xml`.
- Root `layout.tsx` has no `robots` and no default canonical (in production it also emits a site-wide organisation JSON-LD block); pages set their own. `pageMetadata()` in `lib/seo.ts` is for marketing pages (canonical + OG/Twitter, default OG image 1731x909 `/og-image.jpg`). The station page does **not** use it.

### Share images (`opengraph-image.tsx`)

1200x630 PNG via `next/og` `ImageResponse`. Artwork (400x400) beside genre eyebrow, the name (font size steps 92/74/58/46 at 14/24/40 chars) and "Listen on GoCast". Artwork is fetched server-side (4s timeout) and inlined as a data URL, but only for `png/jpeg/jpg/gif` and at most **5 MB**; anything else (WebP, AVIF, error, timeout) falls back to a generated disc, so the card never 500s. Unknown station renders a card named "GoCast" (no 404).

### Client side (`PlayerView.tsx`)

State machine, in words:

- **Play button** (and clicking the vinyl artwork, which is `aria-hidden`, `tabIndex -1`) is never disabled. `pressPlay` plays when `audible = is_on_air || playing || loading || nowPlaying.title !== null`; otherwise it toasts "{name} is off air right now" and scrolls to and focuses the notify-me input (`#notify-{slug}`). Off air the dock button is dimmed (`opacity-60`) and labelled "Off air". (It used to be `disabled`, which Clarity recorded as rage clicks on every station that spends its day off.)
- **Air label**: `airState` = `live` (red, breathing ring) if `is_live`, `onair` (green) if `is_on_air`, else `off`. Labels "Live" / "On air" / "Off air".
- **Off air** (`!audible`): shows an "Off air" badge and the `NotifyMeForm`. Dock label reads "Off air" and "Nothing playing right now".
- **Feed**: `usePublicStationFeed` merges `count`, `is_live`, `is_on_air` into state and applies `now_playing` **only until the first in-band ID3 has arrived** (`hasInbandMetadataRef`). If the feed says `is_on_air === false` while `loading`, playback is torn down.
- **`onWaiting`**: if the station is not on air, tear down; otherwise show the spinner. This is what stops a never-ending spinner when a station is turned off under a listener.
- **Now playing / Just played**: single writer `applyMetadata` drops unchanged metadata and pushes the outgoing track into `recentTracks` (max `MAX_RECENT_TRACKS = 5`, in memory only, lost on reload). A "Just played · N" button opens a sheet when there is at least one.
- **In-band ID3**: `readCues` reads `TIT2` (title), `TPE1` (artist) and the `TXXX` frame described as `StreamTitle` (ICY string, split on `" - "`) from a `metadata` text track set to `hidden`. A tag without a title is ignored so the poll stays in charge. Placeholder values (`unknown`, `n/a`, `-`, `none`, `null`, `untitled`, empty) become null.
- **Tab title**: while playing, `▶ {title} · {artist} · {station} | GoCast` (`useDocumentTitle`).
- **Media Session**: while playing, sets lock-screen metadata (artwork falls back to `/media-icon-512.png`, declared `512x512 image/png` regardless of the real image), handlers for play/pause/stop; seek and track handlers set to null.
- **Volume** (desktop only; the control is hidden below a 900px container width and slides in only while playing): slider 0-100, default 80, mute restores the previous level.
- **Follow** (heart): `listenerLibrary` localStorage helpers `isSaved/toggleSaved/subscribeLibrary`. **`recordListen`** is called when the listener presses play (feeds the homepage "pick up where you left off" row). Neither touches the server.
- **Share**: `shareOrCopy(url, name, "Listening to {name} on GoCast")` (`lib/share.ts`): `navigator.share` if present (any error, including cancel, falls through to clipboard), else `navigator.clipboard.writeText` with a toast; if clipboard is unavailable, an error toast shows the URL for 8s.
- **Social links**: `StationLinks` renders `station.social_links` through `resolveSocialLink`; malformed rows are skipped, not thrown. Anchors use `target=_blank`, `rel="noopener noreferrer nofollow ugc"`. Known platforms show only a glyph; unknown hosts show a globe plus the label (max 16ch). See Social links below.
- **Description**: three-line clamp; a "Read more" button appears only when measured text overflows (ResizeObserver, re-measured after fonts load) and opens a sheet with the full text (`whitespace-pre-line`).
- **Schedule**: a "Full schedule" button in the dock appears when `station.schedules.length > 0` and opens a "Weekly schedule" sheet (`ScheduleList`). These are advertised show times only; they do nothing to audio (see [Schedule](schedule.md)). `StationSheet` is a centred `Dialog` on desktop and a bottom `Sheet` on mobile (`useIsMobile`).
- **Featured**: a rosette icon with tooltip "Hand-picked by GoCast" next to the name when `station.featured`.
- **Footer of the dock**: "Powered by GoCast" (hidden below 520px) and a "Launch your own station" link to `/auth/register`.
- The page never spins the artwork; the vinyl only "ripples" while `playing`.

### Schedule sheet time conversion (`ScheduleBlock.tsx`)

`ScheduleList` prints each row in the station's clock. When the viewer's zone (`Intl` resolved zone) differs from `station.timezone`, it converts using the row's `next_occurrence` (one real instant computed by the API): the viewer's time is shown as the main value with the station's day/time in brackets, and the day set is shifted by the weekday difference (normalised to -1/0/+1). Documented approximation: across a DST change a row can be an hour out, which only matters within an hour of midnight. Contiguous day runs of 3 or more collapse to "Mon–Fri"; all seven is "Every day". A station with no timezone shows raw `start_time` values only.

## Audio transport

Two transports, **HLS preferred, Icecast as fallback**. Both drive one `<audio preload="none">` element, so nothing is fetched before Play.

Ladder (identical logic in `PlayerView.togglePlay` and `useStreamPlayback.start`):

1. `hls_url` null: Icecast.
2. `Hls.isSupported()` (Media Source): hls.js with the settings below; transport reported as `hls` on `MANIFEST_PARSED`.
3. Else `audio.canPlayType("application/vnd.apple.mpegurl")` (Safari): native HLS, transport `hls`; if `play()` rejects it falls back to Icecast.
4. Else Icecast: `audio.src = NEXT_PUBLIC_ICECAST_URL + icecast_mount`, transport `icecast`.

hls.js configuration (both copies): `backBufferLength: 30`, `liveSyncDurationCount: 2`, `pLoader: createPlaylistLoader(Hls)`. Everything else is hls.js defaults (hls.js `^1.7.1`). Segments are 4s (`segment_duration = 4.` in `station.blade.php`, `segments = 5`, `segments_overhead = 5`, adts AAC 128k), so two-segment sync is about 8s of headroom.

Error handling on a fatal hls.js error:

| Error type | Action |
|---|---|
| `NETWORK_ERROR` | `createNetworkRecovery` (`lib/hlsRecovery.ts`): retry `hls.startLoad()` after `1000 * 2^attempts` ms (1s, 2s, 4s, 8s, 16s), at most `MAX_ATTEMPTS = 5`, counter reset on every `LEVEL_LOADED`; after the cap it calls `playIcecast` |
| `MEDIA_ERROR` | `hls.recoverMediaError()` (no cap) |
| anything else | `playIcecast()` |

Non-fatal errors are ignored. The retry is in a timer (never inline) to avoid the iOS synchronous-XHR stack overflow (Sentry 150012400).

`createPlaylistLoader` (`lib/hlsPlaylistLoader.ts`) wraps hls.js's default loader so a response delivered *inside* `xhr.send()` (iOS Safari after wake) is re-dispatched via `setTimeout`, preventing the playlist reload loop. A `generation` counter drops deferred callbacks from aborted or destroyed requests.

Teardown (`stop` / `teardown`): destroy hls, `pause()`, `removeAttribute("src")` and `load()` (both are needed), clear in-band metadata, transport, playing and loading flags.

### Two copies of the ladder (drift risk)

`useStreamPlayback` (`client/hooks/useStreamPlayback.ts`) is used **only by the embed**. `PlayerView` still carries its own copy of the ladder, the ID3 reader and the teardown, and imports `hls.js` statically at module top. The hook's doc says PlayerView "should adopt this hook the next time it is touched". They are behaviourally the same today except:

- The hook imports hls.js dynamically on first Play (embed must not download a media engine for visitors who never press play); PlayerView bundles it up front.
- PlayerView's ID3 reader handles a whole tag at once and has the `TXXX StreamTitle` vs `TIT2` distinction; the hook's reader handles frames one at a time (`TIT2` or `info === "StreamTitle"` both go through `parseStreamTitle`, so a real title containing " - " gets split into an invented artist, and `TPE1` patches the artist in afterwards). Any change to the ladder must be made in both files.

### Dev-only HLS proxy

`/hls-proxy/[...path]` serves `LIQUIDSOAP_HLS_DIR` (default `/var/gocast/hls`) straight off disk in `next dev`. Only `.m3u8`, `.aac`, `.ts`, `.m4s`, `.mp4` are served, path traversal is blocked (resolved path must start with `HLS_DIR + sep`), any read error is a 404. Use by setting `LIQUIDSOAP_HLS_BASE_URL=http://localhost:3000/hls-proxy` on the API.

### Cache headers on the audio path

Production HLS is served by nginx, not Next (`infra/native/nginx/gocast-stream.conf`, stream vhost):

| Files | Header |
|---|---|
| `*.m3u8` | `Cache-Control: no-cache`, `Access-Control-Allow-Origin: *` (both `always`) |
| `*.ts, *.aac, *.mp4, *.m4s` | `Cache-Control: public, max-age=31536000, immutable`, CORS `*`, `access_log off` |
| everything else | 404 |

Segments are immutable, which is only safe because Liquidsoap puts a per-boot token in the segment name (`#{m.stream_name}_#{hls_boot}_#{m.position}.#{m.extname}`); the dev proxy sends the same headers.

## Listener session token flow (client half)

`useListenerSession(slug, playing, transport)` runs in both PlayerView and EmbedPlayer. Server half is in [Listener analytics](listener-analytics.md); the parts that matter here:

1. It does nothing until `playing === true` **and** `transport !== null`. A paused tab or a stream that never connects is never counted.
2. `POST {api}/public/stations/{slug}/listen` with body `{transport: "hls"|"icecast"}` (limiter `listener-start`: 30/min per IP). Response `201 {data: {token, beat_every}}`. The token is a 22-char random string that is also the `listener_sessions.id`.
3. Every `beat_every` seconds (server config `analytics.beat_interval_seconds`, default 15; client falls back to 15 if missing) it sends `POST /public/listen/{token}/beat` with `keepalive: true` (limiter `listener-beat`: 20/min **per token**). Errors are swallowed.
4. On effect cleanup or `pagehide` it sends `POST /public/listen/{token}/end` via `navigator.sendBeacon` (falling back to keepalive fetch). Server always answers 204.
5. The effect depends on `[slug, playing, transport]`, so a mid-play HLS-to-Icecast fallback closes the HLS session and opens an Icecast one.
6. **Transport matters for counting**: `ListenerAnalytics::liveCount` adds only the `hls` sorted set to the Icecast listener number, because Icecast listeners are already inside that number. Reporting an Icecast listener as `hls` would count them twice. Live window is `analytics.live_window_seconds` (45).
7. Failure is silent by design; the audio path never depends on these calls. A `404` from `beat` (expired token, e.g. after laptop sleep) is **ignored**: the client never reopens a session (see Gaps).

## The 10-second feed

`usePublicStationFeed` (`hooks/usePublicStationStats.ts`) polls `GET /public/stations/{slug}/listeners` every `POLL_MS = 10_000`. One timer and one request per slug per tab regardless of subscribers (module-level registry). It pauses while the tab is hidden (`document.hidden`) unless a subscriber passes `pauseWhenHidden: false` (only the studio does), catches up on focus only if the last read is at least 10s old, guards against overlapping requests, and ignores non-OK responses. The player page and an embed in the same tab share it. The listener count shown is `count`; the endpoint says the Icecast half moves in minute-sized steps (`stations:sync-listeners`).

## Related stations, Discover

- `RelatedStations.tsx` ("More on GoCast", 3 rows from `/public/featured`) is **dead code**: nothing imports it (checked by grep). It is not on the player page.
- `/discover`: `next.config.ts` has a 307 redirect `/discover` -> `/`, and `discover/page.tsx` also unconditionally `redirect("/")`. `DiscoverFilters.tsx` (search, genre, sort live/new) and `loading.tsx` are orphaned; `PublicStationController::index` and `genres` still exist and are only reachable by direct API calls. The comment in `next.config.ts` says the files are in `app/discover/*`; they are actually under `app/(marketing)/discover/`.
- The only "related" surface a listener sees today is the homepage rail (outside this doc).

## Notify-me box

`NotifyMeForm.tsx`, shown only when the player is not `audible`. Posts `{email}` to `POST /public/stations/{slug}/notify`. Server (`StationNotifyController::store`): lower-cases and trims the email, validates `required|string|email|max:255`, `Station::where('slug', ...)->firstOrFail()`, then `firstOrNew` on `(station_id, email)`, sets `notified_at = null` and saves. So the endpoint is idempotent and **re-arms** an email that was already notified. Throttle: `public` plus 5 requests per 60 minutes per IP. Response message "We'll email you when {name} goes live." The client stores subscribed slugs in `localStorage["gocast:notify-subscribed:v1"]` (read after mount to avoid a hydration mismatch) and then shows "You'll get an email when this station next goes live." Sending is out of scope here: `SendStationLiveNotifications` (queued job) emails subscriptions with `notified_at` null while the same stream session is still open; see [Notifications and email](notifications-and-email.md).

## Pro embed

- **Snippet**: `lib/embed.ts` `embedSnippet(slug, name)` produces an `<iframe src="{APP_URL}/embed/{slug}" title="{name} on GoCast" width="100%" height="88" style="border:0;border-radius:12px;overflow:hidden" allow="autoplay" loading="lazy">`. `EMBED_HEIGHT = 88`. Station name has `"` escaped as `&quot;` (other characters are not escaped).
- **Where owners get it**: `EmbedDialog` (snippet in a `<pre>`, live preview in a real iframe at 88px height, "Copy code"). Opened from `YourLinkCard` ("Your link" → Embed), which sits on the overview and in the studio's right column (the studio's old `StreamPanel` is gone). It checks `useEmbedLocked()` (`contexts/AccountContext.tsx`): true only when the plan is known and `embed_enabled` is false. Locked accounts see a PRO tag on the button, and clicking opens the Pro-request dialog (`useProRequest`) instead of the snippet. An unknown plan renders unlocked; the embed page is what actually refuses.
- **Gate**: `PublicEmbedController::show` loads `user.plan` and does `abort_unless($station?->user?->canEmbed(), 404)`. `User::canEmbed()` is `plan?->embed_enabled ?? false` (no plan row is free). Migration `2026_09_08_100000` sets it true for `pro` and for every plan other than `free`/`pro`, false for `free`. 404 rather than 403 so a stranger cannot learn that a slug exists and is on Free. The station's public payload (`/public/stations/{slug}`) does **not** reveal the plan and still works for Free.
- **Downgrade takes effect within about 30s** of cache expiry: `embed/[slug]/page.tsx` fetches with `next: { revalidate: 30 }` (dev: `no-store`, two attempts, 3s timeout). On any non-OK or fetch error it returns `null` and the page 404s. Caveat: an API error therefore also 404s an embed (unlike the station page, which distinguishes).
- **Metadata**: title `"{name} — Player"` (or "Not available"), `robots: {index:false, follow:false}`, canonical pointing at the station page.
- **Framing headers** (`next.config.ts` `headers()`): every path except `/embed/...` (negative lookahead `/((?!embed/).*)`) gets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. `/embed/:path*` gets only `nosniff` and the referrer policy: **no X-Frame-Options and no `frame-ancestors`, no CSP at all** (`frame-ancestors *` would not match `file://` pages). So any site can frame any embeddable station. There is no per-customer domain allowlist. Nothing in `client/` sets a CSP. The API nginx vhost sets `X-Frame-Options SAMEORIGIN` (`infra/native/nginx/gocast-api.conf`) but that is the API, not this page.
- **Middleware** (`client/proxy.ts`): the matcher excludes `api`, `embed`, `_next/static`, `_next/image`, `.png`, `.svg`, so the embed never touches the auth-cookie logic. `/dashboard*` redirects to `/auth/login` without a verified `user` cookie; `/auth/login` and `/auth/register` redirect signed-in verified users to `/dashboard/stations`.
- **`EmbedPlayer`**: one row (56px artwork, name, LIVE pill when `is_live && !offAir`, subtitle, listener count when > 0 and not off air, 44px play button, and a "on GoCast" link to `/station/{slug}` in a new tab, hidden below the `sm` breakpoint; the link carries `?utm_source=embed&utm_medium=share`, see `taggedStationUrl` in `lib/share.ts`). Subtitle is "Off air" / "Artist — Title" / "Live now" / "On air". The play button is disabled when off air. Uses `useStreamPlayback` (dynamic hls.js import), `useListenerSession` (so embed listeners count in the owner's audience) and the shared 10s feed. In-band ID3 wins over the poll once present (`inband ?? polled`). When the feed says off air while loading, it calls `stop()`.
- The embed does **not** have: volume, follow, share, schedule, notify-me, recent tracks, social links, or the owner chip.
- The embed inherits the root layout, so in production it also loads the site's third-party scripts (see Gaps).

## Social links

- Storage: `stations.social_links` JSON. Validation (`UpdateStationRequest`): `nullable|array|max:8` (`Station::MAX_SOCIAL_LINKS`), each item `array:label,url` (no extra keys), `url`: `required|string|url:http,https|max:2048`, `label`: `nullable|string|max:30`. The client mirrors 8 as `MAX_SOCIAL_LINKS`.
- Icon resolution is by hostname only (`lib/socialLinks.ts`): `www.` stripped, then labels peeled from the front until a `PLATFORMS` key matches (stops at two labels), so `artist.bandcamp.com` matches `bandcamp.com`. About 40 hosts are known (Instagram, Facebook, X/Twitter, YouTube, TikTok, SoundCloud, Bandcamp, Spotify, Apple Podcasts (`podcasts.apple.com` only), Deezer, Tidal, Twitch, Kick, Discord, Telegram, WhatsApp, Threads, Bluesky, `mastodon.social` only, Reddit, Linktree, Patreon, PayPal, Cash App, LinkedIn, Pinterest, Snapchat, VK, GitHub, Medium). Anything else, and any other Mastodon instance, gets the globe plus its name. Only `http:` and `https:` render.
- Editor (`settings/LinksCard.tsx`, Station settings "Links on your player page", `#links`): paste an address and press Add (or Enter); Add and Remove each save at once as a full-list `PUT /stations/{slug}` with `{social_links: [...]}`. The scheme is prepended (`normalizeSocialUrl`); an unparseable URL and a duplicate are refused client-side with a toast. There is no label field any more: new links are sent with `label: null` (the player shows the platform name or hostname), and labels saved by the old editor are kept because the list goes back as it was.
- Owner links carry `nofollow ugc` on the player page.

## Dashboard share pieces

- `YourLinkCard` (overview and studio, "Your link"): a `CopyField` showing the bare player URL and copying the `owner`-tagged one (`taggedStationUrl`, `?utm_source=owner&utm_medium=share`), plus **Tune-in code**, **Embed** (Pro-gated as above) and **Share…**. The player URL is built from `NEXT_PUBLIC_APP_URL`.
- `share/TuneInCodeDialog`: a QR of the `qr`-tagged URL via `qrcode.react`, canvas rendered at 640px and shown smaller, error-correction level H, 4-module margin, the logo excavated in the centre, foreground `#4c1d95` on white, "Download PNG" as `{slug}-qr.png`. It is the only QR in the app now (the studio's 180px QR went with `StreamPanel`; the studio shows `YourLinkCard` instead).
- `share/ShareDialog`: Copy link, WhatsApp, Email, X, and the system share sheet where `navigator.share` exists.
- Station settings "Where listeners find you" (`settings/StreamCard.tsx`) shows the player link and the direct stream address (`NEXT_PUBLIC_ICECAST_URL` + `icecast_mount`, with the app URL in front when that's a same-origin path), each with Copy.

## Configuration

| Name | Where | Effect |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | client | Browser-side API base (feed, session, notify) |
| `INTERNAL_API_URL` | client (server only) | Preferred on the Next server when set (`env.apiUrl` when `window` is undefined) |
| `NEXT_PUBLIC_APP_URL` | client | Canonical URLs, sitemap URLs, embed snippet, share URL, metadataBase |
| `NEXT_PUBLIC_ICECAST_URL` | client | Prefix for the Icecast fallback URL |
| `INTERNAL_ICECAST_URL` | client, dev | Target of the `/stream-proxy` rewrite |
| `RENDER_API_KEY` | **both** `client/.env` (server-only, no `NEXT_PUBLIC_`) and `api/.env` (`config('services.render_api_key')`) | Client sends it as `X-Render-Key` from `publicApiHeaders()`; the `public` rate limiter returns `Limit::none()` when it matches (`hash_equals`). Unset on either side, or unequal: 60/min per IP applies to server-side renders. Production: `infra/native/README.md` says it goes in `/etc/gocast/client.env` (mode 0600) read by `gocast-client.service`, then restart both |
| `LIQUIDSOAP_HLS_BASE_URL` | api | Base of `hls_url`; empty disables HLS in the player |
| `LIQUIDSOAP_HLS_VARIANT` | api | Media playlist name (default `aac`); changing it is a breaking public-URL change |
| `LIQUIDSOAP_HLS_DIR` | api and client (dev proxy) | Disk path served by the dev proxy |
| `ANALYTICS_BEAT_INTERVAL` / `ANALYTICS_LIVE_WINDOW` / `ANALYTICS_PLAYER_TRANSPORT` | api | Session cadence (15), live window (45), default transport when the player does not send one (`hls`). Setting the last to `icecast` while players also report `hls` is the double-count trap |

`RENDER_API_KEY` scope: it lifts the limit for the Next **server's** fetches only (station page, embed page, OG image, sitemap, homepage rail). Every **browser** call (feed, `listen`, `notify`) still counts against per-IP limits.

## Rate limits that touch listeners

| Limiter | Value | Keyed by |
|---|---|---|
| `public` | 60/min, bypassed with a valid render key | IP |
| `throttle:5,60` on notify | 5/hour | IP (on top of `public`) |
| `listener-start` | 30/min | IP |
| `listener-beat` | 20/min | session token (`beat` and `end`) |

## Surfaces

- **Player page**: `/station/{slug}` (this doc).
- **Embed**: `/embed/{slug}`, Pro only.
- **Dashboard**: overview share card, studio stream panel, settings > Links; the Embed button is Pro-badged for Free.
- **Marketing/help**: `client/app/(marketing)/help/_content/your-player-page.tsx` and `share-your-station.tsx` describe these features to owners; not read for this doc (copy may drift).
- **Mobile**: not covered here; the app has its own player.
- **Admin**: none.

## Gaps and traps

1. **Embed 404 hides API errors.** `getEmbeddableStation` returns null on any non-OK or thrown error, so an API outage or a 429 shows a 404 in customers' iframes. The station page throws instead (`getStation.ts`).
2. **`embed/[slug]/page.tsx` docblock is wrong**: it says `next.config.ts` "sends `frame-ancestors *`". The config sends neither `X-Frame-Options` nor `frame-ancestors` for `/embed/*` (the config comment explains why). Code wins; there is no CSP anywhere.
3. **Third-party scripts load on the embed and player pages.** In production `layout.tsx` injects Umami, Google Tag Manager/gtag (`G-44FJYHJWQR`) and Microsoft Clarity on every route, including `/embed/*` inside other people's sites. No consent banner exists.
4. **`RelatedStations.tsx` is dead** and its skeleton says "More live now" while the loaded state says "More on GoCast".
5. **Discover is orphaned**: `DiscoverFilters.tsx` and `loading.tsx` are unused; `/discover` redirects twice over (config 307 and page-level `redirect`). API endpoints `index`/`genres` remain public and unsurfaced.
6. **Two copies of the transport ladder** (PlayerView and `useStreamPlayback`) with slightly different ID3 handling; the embed's reader splits real titles containing " - " into a fake artist and can flip a title before its artist arrives.
7. **Beat 404 is never handled**: after a laptop sleep past the server token TTL the client keeps beating a dead token and the listener silently stops counting until they stop/start playback. Only `open()` sets the token.
8. **NAT'd audiences and the `public` limiter.** Each open, visible tab polls `/listeners` every 10s (6/min). Ten listeners behind one address exhaust the 60/min `public` bucket; the feed swallows the 429, so counts and the off-air teardown just stop updating. The render key does not help browsers.
9. **`is_on_air` on the initial HTML is intent, cached up to 60s** (`revalidate: 60`); the first feed tick (up to 10s) corrects it. A station just turned off can render as playable for up to a minute, and `audible` enables Play from stale data.
10. **`user_id` is public and the owner cookie is unsigned**: the "You own this" chip is cosmetic, but it means an arbitrary visitor can see the chip by forging a `user` cookie. Nothing privileged is behind it.
11. **`indexable` strictness**: `station.indexable === false` only. A payload without the field (API change, older cache) is treated as indexable.
12. **Sitemap cap**: `/public/sitemap/stations` truncates silently at 50,000; the frontend does not split files.
13. **Media Session artwork** is always declared `512x512 image/png` even when it is the station's own artwork (any size or type), and falls back to `/media-icon-512.png`.
14. **Free stations have a fully public, playable page.** Only the embed is plan-gated; `hls_url`/`icecast_mount` are public in the JSON. There is no access control on who can listen.
15. **Notify-me is unauthenticated and unverified**: anyone can subscribe any email address to any existing station (5/hour per IP), and this endpoint sends no confirmation. Whether the eventual email carries an unsubscribe link is not checked here; see the notifications doc.

## Tests

- `api/tests/Feature/PublicEmbedTest.php`: Pro payload, Free 404 identical to unknown slug, downgrade takes it dark, `/public/stations/{slug}` unaffected by plan, `UserResource` `embed_enabled`, seeded plan rows.
- `api/tests/Feature/PublicStationSeoTest.php`: stations sitemap contents, `indexable` on show (never-started, listener history, running), omitted from list responses, render-key exemption (right key, wrong key, no key configured).
- `api/tests/Feature/StationNotifySubscriptionTest.php`: idempotent subscribe and re-arm, delayed job scheduling and delivery conditions.
- `api/tests/Feature/ListenerSessionTest.php`: server half of the token flow.
- **No client tests** cover the player, embed, hls recovery, sitemap or metadata (`client/tests/e2e` has only auth and help-screenshot specs).

## History

Plans and handoffs (history only, not spec): `docs/features/schedule.md` for the schedule sheet; embed decision, SEO fixes, HLS iOS reload-loop fix (commit `ea570df`) and the harbor/HLS latency change are recorded in the project memory notes and `docs/` plans, which are stale where they disagree with the code above.
