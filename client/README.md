# GoCast — Client

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/ui.

## Development

```bash
npm install
npm run dev       # Next dev server on http://localhost:3000
npm run build     # Production build
npm run start     # Serve production build
npm run lint
npm run analyze   # Build with @next/bundle-analyzer
```

The client proxies API calls via `proxy.ts` / `lib/axios.ts` — base URL comes from `NEXT_PUBLIC_API_URL` (and `NEXT_PUBLIC_WS_URL` for the relay).

## Route map

- `/` — marketing homepage
- `/auth/login`, `/auth/register`, `/auth/forgot`, `/auth/callback` — auth flows (password + Google OAuth)
- `/discover` — public station directory
- `/station/[slug]` — listener player page
- `/station/[slug]/embed` — iframe-friendly mini player
- `/dashboard` — authenticated station list
- `/dashboard/stations/[slug]` — station detail + settings
- `/dashboard/stations/[slug]/live` — go-live flow: pre-flight checklist (mic/music toggle, listener URL), connecting progress, refresh-recovery card, and on-air success view with share link
- `/dashboard/stations/[slug]/studio` — broadcaster console once on-air: push-to-talk, file queue, transport, now-playing, stream panel (redirects back to `/live` if the session drops)
- `/dashboard/broadcasts` — past sessions
- `/dashboard/settings` — account (profile, password, delete)
- `/roadmap`, `/privacy`, `/terms` — static pages

## Structure

- `app/` — routes (App Router)
- `components/` — UI components (`dashboard/`, `homepage/`, `studio/`, `ui/`)
- `contexts/` — React contexts (e.g. `BroadcastContext`)
- `hooks/` — custom hooks
- `lib/` — client utilities (axios, share, format, listener library, milestones)
- `interfaces/` — shared TS types
- `actions/` — server actions

## Observability

Sentry is wired via `@sentry/nextjs` (`instrumentation.ts`, `sentry.*.config.ts`).

## Deployment

Deployed by `infra/native/deploy-native.sh`, which rebuilds this tree only when
something under `client/` changed. See `infra/native/README.md`.

Two things about this client specifically:

- `next.config.ts` sets `output: "standalone"`. Next does **not** copy `public/`
  or `.next/static` into `.next/standalone`, so the deploy script does it after
  every build. Without that copy the site serves HTML with no CSS or images.
  The systemd unit (`infra/native/systemd/gocast-client.service`) runs
  `node server.js` from `.next/standalone` — not `next start`.
- `NEXT_PUBLIC_*` are inlined into the browser bundle at **build** time, from
  `infra/native/env/domains.env`. Setting them in the service file does
  nothing; a wrong API URL can only be fixed by rebuilding.
