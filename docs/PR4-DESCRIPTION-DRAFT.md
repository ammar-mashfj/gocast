## New design

The dashboard, studio, auth pages and homepage rebuilt on the design system in `components/ds`, with lint guardrails (`client/eslint.config.mjs`) and a Playwright visual pass (`npm run test:visual`). Decisions and the build log: `docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md`, `DESIGN.md`.

### Dashboard
- Shell: top bar with breadcrumb and station clock, status band on every page (one `airState` resolver drives the band, the sidebar lamp and the overview hero), setup menu, phone tab bar.
- Overview: hero with the power controls and the eight station states, your-link card with share and tune-in code, coming-up card, shows links.
- Go live: one page for pre-flight (mode, mic check, running order with pick-up/start-over), the checks, and air. The connection check picks 128/96/64 kbps from a timed upload or refuses a line too slow; the studio steps the bitrate down and back up in-show.
- Studio: now-playing deck, stats tiles, shortcuts dialog, wrap screen after End show.
- AutoDJ group: Library, Playlists (new `/playlists` route), Schedule; jingles dialog with presets.
- Settings: profile, links (with names), show times, stream addresses, encoder card with "Put it on air" and a connection watcher, typed-slug delete.
- Your shows: paged past shows with a whole-history summary from the API; `peak_at` on broadcasts.
- Create station: read-only link preview as you type (`GET /stations/slug-preview`).

### API
- Every throttled route names its own limiter (they shared one per-user bucket).
- `GET /stations/slug-preview`, `POST /broadcast/uplink-probe`, `POST /stations/{slug}/uplink-checks` (admin monitoring), `summary` and `?finished=1` on sessions index, `peak_at` migration.

### Checks
- `php artisan test` on the touched feature files, `npm test`, `tsc`, `lint`, `scripts/docs-check.sh` all pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
