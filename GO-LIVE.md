# GoCast — Go-Live Readiness Report

## What's Done (working)

| Area | Status |
|------|--------|
| **API**: Auth (register/login/logout), Station CRUD, Stream Sessions, Internal relay endpoints | Done |
| **Client**: Auth flow, Dashboard, Station detail, Player page, Go-Live wizard, Studio/Broadcaster | Done |
| **Relay**: WebSocket-to-Icecast bridge, auth, metadata, listener polling, health check, graceful shutdown | Done |
| **Database**: Migrations, models, relationships, policies | Done |
| **Docker**: Basic Dockerfiles for all 3 services, dev docker-compose | Done |

---

## What's Missing — Organized by Priority

### CRITICAL (Blockers — must fix before going live)

| # | Issue | Service | What to do |
|---|-------|---------|------------|
| ~~1~~ | ~~Secrets in git history~~ | ~~All~~ | **NOT AN ISSUE** — `.env` files are NOT tracked in git. Only `.env.example` files are committed. Secrets are safe. |
| 2 | **APP_DEBUG=true** | API | Set `false` in production — exposes stack traces and env vars to users |
| 3 | **No nginx reverse proxy** | Infra | Need nginx config for: domain routing, SSL termination, WebSocket upgrade (`/ws/`), Icecast proxy (`/stream/`), SPA fallback |
| 4 | **No SSL/TLS** | Infra | Client `.env.production` references `https://api.gocast.fm` and `wss://relay.gocast.fm` but no certs exist. Need Let's Encrypt + certbot |
| 5 | **Dockerfiles are dev-only** | All | API runs `artisan serve` (not production). Client runs `npm run dev`. Need: API -> PHP-FPM + nginx, Client -> build + nginx static serve |
| 6 | **No production docker-compose** | Infra | Current compose is for local dev. Need `docker-compose.prod.yml` with proper services, secrets, health checks, restart policies |
| 7 | **Hardcoded "hackme" passwords** | Relay | Relay defaults to `"hackme"` for Icecast passwords if env vars are missing. Must require env vars or fail |

### HIGH PRIORITY (Should fix before launch)

| # | Issue | Service | What to do |
|---|-------|---------|------------|
| 8 | **No rate limiting on public/internal routes** | API | Public listener endpoint and internal relay endpoints have no throttling |
| 9 | **ESLint errors (5)** | Client | `NowPlaying.tsx`, `StreamPanel.tsx`, `AuthContext.tsx`, `BroadcastContext.tsx`, `button.tsx`, `sidebar.tsx` — must fix before production build |
| 10 | **No error boundary** | Client | Unhandled JS error crashes the entire app. Add a React Error Boundary |
| 11 | **`index.html` title is "client"** | Client | Change to "GoCast — Live Radio Streaming" |
| 12 | **`robots.txt` blocks all crawlers** | Client | `Disallow: /` blocks Google. Remove or adjust for public pages |
| 13 | **`noindex, nofollow` meta tag** | Client | Same issue — blocks SEO. Remove for production |
| 14 | **Sanctum token expiry = 30 days** | API | Too long. Reduce to 24h or 7 days max |
| 15 | **`laravel/tinker` in production deps** | API | Move to `require-dev` — allows arbitrary code execution |
| 16 | **LOG_LEVEL=debug** | API | Change to `warning` or `error` for production |
| 17 | **MAIL_MAILER=log** | API | Email verification won't actually send emails. Configure SMTP/Mailgun/SES |
| 18 | **No input validation in relay** | Relay | No validation on metadata title/artist length, mount points. Can be abused |
| 19 | **No WebSocket connection limits** | Relay | No rate limiting or per-IP limits. Resource exhaustion risk |
| 20 | **No backpressure handling** | Relay | `icecastSocket.write(data)` ignores backpressure return value |

### MEDIUM PRIORITY (Should have soon after launch)

| # | Issue | Service | What to do |
|---|-------|---------|------------|
| 21 | **Zero tests** | All 3 | No tests anywhere. At minimum: auth flow tests, station CRUD tests, relay auth test |
| 22 | **No CI/CD pipeline** | Infra | No GitHub Actions. Need: lint, type-check, test on push + deploy on merge |
| 23 | **No error tracking** | All | No Sentry or similar. You'll be blind to production errors |
| 24 | **No database backups** | Infra | MySQL data is only in a Docker volume. One `docker-compose down -v` and it's gone |
| 25 | **No monitoring/health checks** | Infra | Relay has a health endpoint but nothing checks it. No uptime monitoring |
| 26 | **No log aggregation** | All | API logs to file, relay logs to stdout. No centralized logging |
| 27 | **No OG meta tags** | Client | Player page has no social sharing tags — shared links look blank on Twitter/WhatsApp |
| 28 | **No code splitting** | Client | 520KB single JS bundle. Lazy-load dashboard routes |
| 29 | **Missing LICENSE file** | Root | README claims MIT but no LICENSE file exists |
| 30 | **No API versioning** | API | All routes under `/api` with no version prefix |

### NICE TO HAVE (Post-launch)

| # | Issue | Details |
|---|-------|---------|
| 31 | Password reset flow | Migration exists but no controller/routes |
| 32 | 404 page | Currently redirects to home |
| 33 | Accessibility (`prefers-reduced-motion`) | Heavy animations on player page |
| 34 | PWA manifest | For mobile "Add to Home Screen" |
| 35 | Deployment documentation | No runbook for VPS setup |

---

## Recommended Go-Live Plan

### Phase 1 — Security & Secrets (do first)

1. ~~Rotate all passwords and API keys~~ — NOT NEEDED, `.env` files were never committed
2. Set `APP_DEBUG=false`, `LOG_LEVEL=warning`
4. Move `laravel/tinker` to `require-dev`
5. Configure real email service (Mailgun/SES)

### Phase 2 — Production Infrastructure

6. Create production Dockerfiles (PHP-FPM, nginx static serve)
7. Create nginx config with SSL (Let's Encrypt)
8. Create `docker-compose.prod.yml`
9. Set up Icecast on VPS

### Phase 3 — Client Fixes

10. Fix 5 ESLint errors
11. Fix `index.html` title and meta tags
12. Fix `robots.txt` for production
13. Add React Error Boundary

### Phase 4 — Deploy

14. Provision VPS (Ubuntu 24)
15. Configure DNS for `gocast.fm`, `api.gocast.fm`, `relay.gocast.fm`, `stream.gocast.fm`
16. Deploy with docker-compose
17. Run migrations, generate keys
18. Smoke test the full flow: register -> create station -> go live -> listen on player page
