## New design

The dashboard, studio, auth pages and homepage rebuilt on the design system in `components/ds`, with lint guardrails (`client/eslint.config.mjs`) and a Playwright visual pass (`npm run test:visual`). Decisions and the build log: `docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md`, `DESIGN.md`.

### Dashboard
- **Shell:** top bar with breadcrumb and station clock, a status band on every page (one `airState` resolver drives the band, the sidebar lamp and the overview hero), the setup chip ("2 of 5 set up") in the top bar, and a phone tab bar.
- **Overview:** the hero with the power controls and the station states; Copy player link, **QR code & embed** (tune-in code, the Pro embed, and the phone's own share sheet) and Open ↗ under the station name. The link card, Coming up card and recent-shows links are off.
- **Go live:** one pre-flight page (mode, mic check, running order with pick-up/start-over). Go live opens the studio, where the checks run in a dialog: connection (a timed upload picks 128/96/64 kbps, or refuses a line too slow), station, mic, audio engine. The studio steps the bitrate down and back up in-show.
- **Studio:** now-playing deck, stats tiles, shortcuts dialog, focus mode (desktop), an "Off air" notice with Go back on air / End show when a show is lost for good, and the wrap screen after End show.
- **AutoDJ group:** Library, Playlists (its own `/playlists` route), Jingles (its own page), Schedule (week grid; the timezone is changed here).
- **Settings:** profile, links (picker per site, Other links kept as typed), stream addresses, the encoder card with "Put it on air" and a connection watcher, typed-slug delete. Show times are no longer on the web (DB, API and the mobile app keep them).
- **Live history:** paged past shows with a whole-history summary from the API; `peak_at` on broadcasts.
- **Create station:** a page, with a read-only link preview as you type (`GET /stations/slug-preview`).

### Embed
- The Embed dialog has **Mute button** and **Volume slider** checkboxes, which add `?mute=1` / `?volume=1` to the snippet; the preview updates as you tick. Existing snippets render as before. The slider isn't drawn on iPhone/iPad (they ignore page volume) or below 360px.

### API
- Every throttled route names its own limiter (they shared one per-user bucket).
- New: `GET /stations/slug-preview`, `POST /broadcast/uplink-probe`, `POST /stations/{slug}/uplink-checks` (admin monitoring), `summary` and `?finished=1` on the sessions index, `peak_at` migration, `playlist` on the station status.
- A station save (`PATCH /stations/{slug}`) now answers with `programme`, so the Schedule page's "Right now" stays right after a timezone change.
- `php artisan e2e:seed` (local only) recreates the keeper accounts the Playwright specs sign in as.

### Deploy notes
- **nginx:** `infra/native/nginx/gocast-api.conf` adds `location = /api/broadcast/uplink-probe` capped at 256k. It only takes effect once the file is copied to the server and nginx is reloaded.

### Checks run
- Client: `tsc`, `eslint`, `vitest` (19 files, 129 tests); headless smoke of every dashboard page at desktop and phone width.
- API: the touched feature tests (`AutodjSlotTest`, `StationSlugPreviewTest`, `StreamSessionIndexTest`, `StationSocialLinksTest`, `StationJingleSettingsTest`, `E2ESeedCommandTest`).
- Playwright: `create-station` (3/3), the visual pass (58/58) and the help screenshots, against `e2e:seed` data.
- `scripts/docs-check.sh`: every `docs/features` doc re-verified and re-stamped.
- Not run: the full API suite, and a real go-live in Safari/iOS.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
