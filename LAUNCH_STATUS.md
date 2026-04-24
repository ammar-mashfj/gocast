# GoCast — Launch Status Report

**Generated:** 2026-04-24
**Source:** Static analysis of repo at `/home/ammar/Desktop/personal/gocast` on branch `main`
**Important caveat:** This report is derived from reading source code, config files, and git history. **Nothing here has been verified by actually running the app, hitting the production URL, or manually testing features.** Items marked "coded" mean the logic exists in the repo; items marked "verified" would require live testing that I have not performed. Where I flag uncertainty, the user should independently verify before relying on it.

---

## 1. Current Deployment

| Item | Value | Confidence |
|------|-------|------------|
| Production URL | `gocast.fm` (with `api.gocast.fm`, `icecast.gocast.fm`, `relay.gocast.fm`) | Referenced in `docker-compose.prod.yml` build args and `.env.docker.example`. **Not verified live.** |
| Is it accessible? | **Unknown** — I did not fetch the URL | — |
| Deployed branch | **Unknown** — no deploy metadata in repo | — |
| Last deployed commit | **Unknown** — no deploy artifacts, no `.deploy` file, no CI | — |
| Server / VPS provider | **Unknown** — not documented in repo | — |
| Server specs | **Unknown** | — |

**Current HEAD:** `3e08ac9 chore: update environment configuration for API and relay`
**Working tree:** Significantly dirty — 26 modified files and 40+ untracked files (including `docker-compose.prod.yml`, `docker-compose.observability.yml`, `Caddyfile.cloudflare`, new Commands, Services, Notifications, tests, docs). This strongly suggests a large in-progress release that has not been committed.

**Recommendation:** Before anything else, commit/branch the current working tree so you don't lose it. The v2 release state is not captured in git yet.

---

## 2. Working Features (coded — NOT independently verified)

I cannot mark anything "verified" because I have not run the app. Below is what the code clearly implements. Treat this as "feature is built" not "feature works."

### Auth
- Email/password registration with email verification (6-digit codes via Resend mail driver)
- Email/password login with per-account + per-IP throttle + account lockout after 5 failed attempts
- Google OAuth via Laravel Socialite (stateless, signed-state cookie, 10-min TTL)
- Password reset (forgot → 6-digit code → reset), throttled, always-200 to prevent enumeration
- Logout, user profile GET, password change, email change, account deletion

### Stations
- Full CRUD on stations (list, create, show, update, delete)
- Slug generation + validation
- Soft delete
- Featured flag for homepage curation
- Plan-based station limits (plans table: free/starter/pro/studio)

### Broadcasting (browser → Icecast)
- Mic capture via `getUserMedia` (44.1kHz, mono, AGC/echo/noise all off)
- MP3 encoding in-browser via `lamejs` at 128kbps
- WebSocket transport to Node relay
- Raw TCP SOURCE protocol relay → Icecast
- 5s silence keepalive to prevent Icecast source timeout
- Metadata updates (title/artist) pushed to Icecast and Laravel API
- Screen wake lock during active broadcast
- 30s disconnect grace with Icecast fallback mount (`/standby.mp3`) serving Liquidsoap silence
- Multi-device conflict handling (only one device per station can be live; second kicks first with close code 4006)
- Per-device UUID in localStorage for session continuity

### Listening
- Public player page at `/station/[slug]` with `icecast-metadata-player`
- Related stations component
- Real-time listener count (relay polls Icecast `/status-json.xsl` every 10s)
- "Notify me when live" email capture (**but**: migration file explicitly flags the event handler that actually sends the notification as TODO — see §3)

### Discovery
- `/discover` page with genre filters and live-now indicator
- Featured stations endpoint (`GET /public/featured`)
- Genre list endpoint

### Admin (Filament v4)
- Admin panel with separate `admins` table
- Resources for Users, Stations, Stream Sessions, Plans, Waitlist, Activity Log, Auth Log, Admins
- Login abuse detection command + notification
- Idle-session expiration

### Scheduled Jobs
- `CleanStaleStreams` — marks sessions ended if offline > 1hr
- `NudgeInactiveBroadcasters` — day-7 re-engagement email
- `DetectAdminLoginAbuseCommand` — brute-force detection

**Platform/browser testing:** No evidence in the repo of cross-browser testing matrix. One Playwright spec (`auth.spec.ts`, Chromium-only) covers auth flows. Mobile/Firefox/Safari are untested as far as I can tell.

---

## 3. Known Bugs

**Caveat:** I have no access to an issue tracker from inside this repo. The only "known issue" visible in the code is one explicit TODO. Everything else below is risk/gap inferred from static analysis, not a confirmed bug.

### Blockers
- **None confirmed from the code.** You need to name these — I cannot see them.

### Major (degraded experience)
- **"Notify me when live" emails do not send.** `api/database/migrations/2026_04_20_122249_create_station_notify_subscriptions_table.php:10` explicitly flags the event handler as `TODO`. The subscription form captures the email, but there is no listener wired to `StationLiveNotification` for these subscribers when a station goes live. Users will sign up and hear nothing.

### Minor
- **No demo data seeded.** `StationSeeder.php` is a stub. A freshly provisioned environment has zero stations. Discovery page will be empty on first boot (see §9).
- **No GitHub Actions / CI.** Tests can regress silently between commits.
- **Registration has no ToS acceptance checkbox** (see §7). Legally minor but a pre-launch gap.

---

## 4. Incomplete Features

| Feature | % Complete | Blocker | Required for launch? |
|---------|-----------|---------|---------------------|
| "Notify me when live" | ~70% | Event handler wiring (UI + DB done, mail not sent) | Cut-able — hide form if not fixed |
| Demo stations | 0% | Seeder empty, no audio source decided | Yes — empty Discover page is a dead landing |
| Waitlist email follow-up | Unknown | Waitlist capture exists; no visible autoresponder logic | No |
| Pricing plans enforcement | ~90% | Plans table + station limit exist; payment collection unclear (no Stripe/Paddle deps in composer.json visible in exploration) | Cut — free-tier-only launch is fine |
| `/dashboard/stations/[slug]/studio` | Unknown | Page exists but I did not read its contents in detail | Unknown |

---

## 5. Pages Status

**Caveat:** "Exists" means the file is in `client/app/`. "Styled / functional / mobile-tested" — I did not render these pages, so I cannot attest. Marked `?` where untested.

| Page | Exists | Styled | Functional | Mobile |
|------|--------|--------|------------|--------|
| Landing `/` | ✅ | ? | ? | ? |
| Login `/auth/login` | ✅ | ? | ? | ? |
| Register `/auth/register` | ✅ | ? | ? | ? (no ToS checkbox) |
| Forgot `/auth/forgot` | ✅ | ? | ? | ? |
| OAuth callback `/auth/callback` | ✅ | n/a | ? | n/a |
| Dashboard `/dashboard` | ✅ | ? | ? | ? |
| Stations list `/dashboard/stations` | ✅ | ? | ? | ? |
| Station detail `/dashboard/stations/[slug]` | ✅ | ? | ? | ? |
| Live studio `/dashboard/stations/[slug]/live` | ✅ | ? | ? | ? (mobile broadcasting is risky — wake lock + mic on mobile Safari) |
| Studio `/dashboard/stations/[slug]/studio` | ✅ | ? | ? | ? |
| Broadcasts `/dashboard/broadcasts` | ✅ | ? | ? | ? |
| Settings `/dashboard/settings` | ✅ | ? | ? | ? |
| Discover `/discover` | ✅ | ? | ? | ? |
| Player `/station/[slug]` | ✅ | ? | ? | ? |
| Terms `/terms` | ✅ (191 lines) | ? | n/a | ? |
| Privacy `/privacy` | ✅ (178 lines) | ? | n/a | ? |
| Roadmap `/roadmap` | ✅ (114 lines) | ? | n/a | ? |
| 404 `not-found.tsx` | ✅ | ? | n/a | ? |
| Global error | ✅ | ? | n/a | ? |

**Action:** Walk through every row on a real phone before launch. I cannot do this part.

---

## 6. Infrastructure Status

**Caveat:** Everything here is what the code/configs would do **if deployed as specified**. I have not logged into a server or hit DNS.

| Item | Code ready? | Live state |
|------|-------------|-----------|
| DNS for `gocast.fm`, `api.`, `icecast.`, `relay.` | Not in repo (DNS is external) | **Unknown — check your registrar** |
| SSL certificate | Caddy has Let's Encrypt auto-issue (`Caddyfile`) AND Cloudflare Origin cert mode (`Caddyfile.cloudflare`). Only one is used at a time. | **Unknown which is active** |
| Web server | FrankenPHP + Caddy, running in Docker. Config verified in `api/Dockerfile` + `api/Caddyfile*`. | — |
| Nginx | Not used — Caddy is the reverse proxy. | — |
| Icecast | `infra/icecast/Dockerfile` builds from Alpine; entrypoint renders `icecast.xml.tpl` with env. Passwords from env. | Running depends on Docker Compose being up. |
| Icecast auto-start on boot | Depends on Docker service being enabled systemd-side, which is **outside the repo**. `restart: unless-stopped` is typical in compose but should be verified in `docker-compose.prod.yml`. |
| Node relay | `relay/index.js` (762 lines). Runs as a Docker service in `docker-compose.yml`. | Auto-restart depends on compose `restart:` policy + Docker service being up. **Not pm2 or systemd directly** — Docker is the supervisor. |
| Laravel queue workers | `docker-compose.yml` has a queue worker service. Redis is the driver. | Depends on compose being up. |
| MySQL | 8.4 in compose. Prod compose removes published port. | — |
| Redis | 7-alpine in compose. Used for cache, queue, broadcasting. | — |
| Backups | **No backup config found in repo.** No `backup.sh`, no Laravel backup package, no S3 lifecycle. **This is a gap.** |
| Monitoring | Grafana Alloy is configured (`infra/alloy/config.alloy`) to ship logs to Loki and metrics to Mimir on Grafana Cloud. Sentry is wired in both client and server. No alerting rules found in repo. |
| Healthchecks | Relay has `/health` endpoint. No evidence of external uptime monitoring (no Betterstack/Pingdom config in repo). |

**Biggest infra gaps I'd flag:**
1. No backup strategy for MySQL or uploaded audio/images.
2. No alerting rules on Grafana — logs and metrics ship, but no one gets paged.
3. No uptime monitor hitting `gocast.fm` from outside.

---

## 7. Launch Essentials Checklist

| Item | State |
|------|-------|
| OG meta tags on landing | ✅ `client/app/layout.tsx` sets title, description, OG image (`/og-image.png` 1200×630), Twitter summary_large_image, @gocastfm |
| Programmatic OG image generator | ✅ `client/app/opengraph-image.tsx` and `twitter-image.tsx` |
| OG on player pages `/station/[slug]` | ❓ Not confirmed — would need to inspect that page's `generateMetadata`. Flag for manual check. |
| Favicon | ✅ Manifest exists (`client/app/manifest.ts`), theme color #8b5cf6 |
| robots.txt | ✅ `client/app/robots.ts` allows /, /station/, /roadmap; disallows /dashboard/, /auth/, /api/, /monitoring |
| sitemap.xml | ✅ `client/app/sitemap.ts` — dynamic, paginates `/api/public/stations` up to ~2400 stations |
| Analytics | ✅ Umami (`892346df-9d2f-4c40-b76b-442a74ee4557`) + GA4 (`G-44FJYHJWQR`) both in `layout.tsx` |
| Sentry error tracking | ✅ `@sentry/nextjs` v10.49, tunnel at `/monitoring`. Server Sentry not confirmed — check composer.json. |
| Terms of Service | ✅ `/terms` page (191 lines). **DMCA process:** not verified; open the page and confirm the content includes takedown contact. |
| Privacy Policy | ✅ `/privacy` page (178 lines) |
| ToS checkbox on signup | ❌ **Missing.** RegisterRequest validation has no terms-accepted field. Add before launch — even a soft-consent checkbox covers you. |
| Social handles (@gocastfm) | ❓ Referenced in JSON-LD; whether the accounts are *created* is outside the repo |
| Email forwarding (hello@, copyright@) | ❓ `hello@gocast.fm` referenced in metadata. DNS MX setup is outside repo. `copyright@` not found anywhere in code — this matters for DMCA. |
| Transactional email | ✅ Resend configured (`resend-php` v1.3 in composer, mail driver set to resend) |

---

## 8. Technical Debt / Concerns

- **Uncommitted V2 state.** 40+ new files untracked and 26 modified. If the server dies now, git has nothing useful to redeploy from. This is the single biggest risk.
- **No CI.** Nothing catches a broken test before merge. 37 API tests exist but we don't know if they pass on HEAD. Run `php artisan test` before touching anything.
- **Relay is a single 762-line `index.js` file.** Lots of state machine logic (reconnect windows, multi-device conflict, keepalives) in one place. Any bug here takes the whole streaming layer down.
- **BroadcastStateService uses Redis cache for live state.** If Redis is evicted or flushed, all "who is live" state vanishes. Listeners would keep hearing /standby.mp3 until the relay reconnects and re-pushes state. Verify TTLs + persistence.
- **Icecast `<sources>` is 50, `<clients>` is 500.** At 128kbps MP3, 500 listeners = ~8 MB/s = ~64 Mbps egress. VPS bandwidth cap is unknown (§1).
- **No rate limiting on the relay itself** beyond what's documented. A malicious WS client could connect/disconnect in a loop.
- **Sentry DSNs at build time.** `NEXT_PUBLIC_SENTRY_DSN` is baked into the browser bundle. Rotating it means a rebuild+redeploy.
- **lamejs in-browser MP3 encoding** is CPU-heavy on mobile. A broadcaster on a low-end phone may drop frames. Not tested.
- **The whole infrastructure is Docker-Compose on a single host.** No horizontal scaling path is set up. Fine for launch, not fine for a viral moment.
- **Auth cookie domain is `.gocast.fm`.** Any subdomain compromise reads the auth cookie. Review what runs on subdomains.

---

## 9. Demo Stations

- **Configured count:** 0.
- **Seeder:** `api/database/seeders/StationSeeder.php` is a stub.
- **Music source:** N/A — nothing is seeded.
- **Royalty-free?** N/A.
- **Currently broadcasting?** Not determinable from code.
- **Liquidsoap standby bed:** Defaults to pure silence (`blank()` in `infra/liquidsoap/standby.liq`). Operators can swap in a real bed via mount URL (per the README), but the default produces silence. Listeners who hit a station whose broadcaster is offline will hear nothing (silent fallback).

**Recommendation before launch:** create 3–5 demo stations with royalty-free streams. Without them, the Discover page is empty and the product looks dead.

---

## 10. What a User Actually Sees Right Now

Because I haven't run the app, this is a **best-case walkthrough based on the code**. Each step lists the most likely failure mode I'd watch for in a live demo.

1. **User visits `gocast.fm`.**
   - *Happy path:* Landing page renders (Navbar, Hero, HowItWorks, Features, LiveNow, ListenerLibrary, Pricing, CTA, Footer).
   - *Likely failure:* `LiveNow` component hits `/api/public/featured` — if no stations exist (§9), it either renders empty or shows a loading skeleton that never resolves. Also if `.gocast.fm` DNS isn't pointing at the VPS, nothing loads at all.

2. **User clicks "Get started" → `/auth/register`.**
   - *Happy path:* Fills name/email/password, submits. Laravel creates user, sends 6-digit code via Resend.
   - *Likely failure:* Resend API key wrong or domain not verified → email never arrives, user stuck on verify screen. **Test Resend delivery from production env.**
   - *Also:* No ToS checkbox (§7).

3. **User enters code → email verified.**
   - *Happy path:* `email_verified_at` set, `verified` middleware unblocks station routes.
   - *Likely failure:* Code expired (expiry TTL — check `email_verification_codes` migration) and the resend throttle (6/min) kicks in before they notice.

4. **User lands on `/dashboard`, creates a station.**
   - *Happy path:* `POST /stations`, plan limit checked, station saved with slug.
   - *Likely failure:* Slug collision on common names — check what `StationSlugTest` actually asserts. Plan seeder needs to have run (`PlanSeeder`? — verify the `plans` table is populated, or station creation fails on FK).

5. **User clicks "Go live" → `/dashboard/stations/[slug]/live`.**
   - *Happy path:* Browser asks for mic permission, `BroadcastManager` opens WebSocket to `wss://relay.gocast.fm`, relay validates token via internal API, opens Icecast SOURCE TCP socket, starts streaming.
   - *Likely failures, in order of probability:*
     1. **Wrong `NEXT_PUBLIC_WS_URL` env at build time.** It's baked at build, so wrong value = WS connect fails with no clear message.
     2. **Cloudflare proxy doesn't allow WebSocket** on the relay subdomain. Ensure the DNS record is either grey-cloud or WS is enabled.
     3. **Cookie not sent to `relay.gocast.fm`** because `SESSION_DOMAIN=.gocast.fm` was set incorrectly. Auth fails silently.
     4. **Icecast SOURCE password mismatch** between `.env` and the icecast container env — relay gets a 401, WS drops.
     5. **Mic permission denied or HTTPS not enforced** — browsers refuse `getUserMedia` without secure context.

6. **A listener visits `/station/[slug]`.**
   - *Happy path:* `icecast-metadata-player` hits `https://icecast.gocast.fm/live-{id}`, streams MP3, displays metadata.
   - *Likely failures:*
     1. **CORS.** Icecast config sets `Access-Control-Allow-Origin: *`, should be fine. But Cloudflare may strip it — verify in browser DevTools.
     2. **Mixed content** if the client tries to hit Icecast on `http://`.
     3. **Broadcaster disconnected and fallback is silence** (§9). Listener hears nothing and assumes it's broken.
     4. **Listener count** polling hits `/public/stations/{slug}/listeners` — if the relay hasn't pushed counts to Laravel in the last 10s, shows 0 or stale.

7. **User sees "Notify me" form on a station that's currently offline.**
   - Submits email → saved in `station_notify_subscriptions`.
   - **Will never receive the email** because the event handler is TODO (§3). This is the most user-facing broken thing in the product.

---

## TL;DR for launch planning

**What's strong:** Auth stack is thorough. Streaming architecture is well thought out (30s grace, fallback, multi-device conflict). Observability is wired. OG/SEO/analytics are in place. Sentry configured.

**What will block or hurt launch:**
1. Uncommitted V2 state (git hygiene).
2. No demo stations → dead Discover page.
3. "Notify me" form accepts emails then does nothing (false promise to users).
4. No ToS checkbox at signup.
5. No backups or alerting.
6. Nothing in this report has been **verified running** — the whole thing needs a dry-run from a fresh incognito session on desktop and mobile before telling anyone about it.

**What I cannot tell you from this repo:** whether the site is live right now, whether DNS resolves, whether SSL is valid, whether any production data exists, or what the actual UX looks like rendered. You need to walk through §10 end-to-end yourself.
