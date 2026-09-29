# Feature reference

**How things work now**, one file per feature, written from the code. Plans, handoffs and gap analyses elsewhere in `docs/` are history: useful for *why*, never the spec.

## Rules

- **Read the feature doc before changing a feature, and update it in the same change.**
- Every claim should trace back to a file. If you can't point at the code, don't write the claim.
- "Gaps and traps" lists what is misleading, half-built or silently wrong *today*. Fix an item or delete it from the list; don't leave it rotting.
- After re-verifying a doc against the code, re-stamp it with `scripts/docs-check.sh --stamp docs/features/NAME.md`.
- `scripts/docs-check.sh` lists every doc whose source files have changed since it was stamped.

## Template

Front matter holds `feature`, `verified` (the date and commit), `sources` (the files the doc depends on) and `fingerprint` (written by `--stamp`). The body has these sections:

1. One-paragraph summary: what it is, and the one thing people get wrong about it.
2. **What it actually does**: the real effect on the system, including what it does *not* do.
3. Data, endpoints, rules.
4. **Surfaces**: web dashboard, player page, mobile, admin, help.
5. **Gaps and traps**.
6. Tests.
7. History: links to the plans and handoffs.

## Features

Every doc below was written from the code on disk on 2026-09-29, then independently re-checked against it by a second reader. Claims that could only be settled against a running Liquidsoap, Docker, Ably, a device or production are marked as such inside the doc.

### Audio path and station lifecycle
- [Liquidsoap station script](liquidsoap-station-script.md): the generated per-station `.liq`: pull chain, live vs AutoDJ arms, harbor, outputs, every callback to the API.
- [Liquidsoap supervisor](liquidsoap-supervisor.md): how containers are created, found, stopped, reconciled, and what drifts.
- [Station lifecycle](station-lifecycle.md): on/off paths, the state model, sweep and auto-stop, failure matrix.
- [AutoDJ](autodj.md): next-track contract, shuffle decks and cursors, plan gate, live handover.
- [Schedule](schedule.md): AutoDJ slots (programming, Pro) and show times (advertising only), which share one timezone.
- [Library and playlists](library-and-playlists.md): uploads, analysis, playlists, limits.
- [Watermark clips](watermark-clips.md): the free-tier voice ID; built, wired, and inert until clips exist.

### Broadcasting
- [Web studio](broadcasting-web-studio.md): pre-flight, mic, ducking, limiter, transport, reconnect, end.
- [Encoder ingest](encoder-ingest.md): BUTT/Mixxx over the TCP router, stream keys.
- [Mobile studio and encoder](mobile-studio-and-encoder.md): Android broadcasting and the native encoder.

### Listeners
- [Public player and embed](public-player-and-embed.md): player page, HLS/Icecast ladder, embed, SEO.
- [Listener analytics](listener-analytics.md): how a listener is counted, every metric, the Audience page.
- [Realtime events](realtime-events.md): the one push channel, and what everything else polls.

### Accounts and operations
- [Auth](auth.md): every sign-in, token, cookie and throttle flow, web and mobile.
- [Accounts, plans and invites](accounts-plans-invites.md): plan values, every gate, invites, Request Pro, expiry.
- [Notifications and email](notifications-and-email.md): every email and bell notification, suppression, Resend webhook.
- [Admin panel](admin-panel.md): every `/admin` page and action.
- [Observability and events](observability-and-events.md): station events, activity log, Sentry, metrics, alerts.

### Web and mobile apps
- [Station management dashboard](station-management-dashboard.md): dashboard shell, station CRUD and settings.
- [Web shared frontend](web-shared-frontend.md): Next.js config, providers, hooks, UI primitives.
- [Marketing, help and blog](marketing-site-help-blog.md): public site, every article, and the claims the code contradicts.
- [Mobile app shell and auth](mobile-app-shell-and-auth.md): Expo skeleton, navigation, sign-in.
- [Mobile station screens](mobile-station-screens.md): overview, library, schedule, audience, show times.

### Reference
- [Data model](data-model.md): every table, column, relation, and dead column.
- [API reference](api-reference.md): every route, validation rule, throttle, error code, artisan command and schedule.
- [Configuration reference](configuration-reference.md): every config key and env var, per app.
- [Deployment and infra](deployment-infra.md): process/port map, native kit, scheduler, TLS, backups.
- [Dev environment and testing](dev-environment-and-testing.md): running and testing, coverage map, untested features.
