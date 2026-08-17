# GoCast

A freemium internet radio streaming platform. Broadcast live audio from your browser, get a shareable player page, and listeners tune in instantly. No downloads, no server setup.

## Tech Stack

- **API**: Laravel 13 + Sanctum + MySQL 8 + Redis
- **Client**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Ingest**: MediaMTX (WHIP/WebRTC from browsers, RTMP for OBS, SRT for pro rigs)
- **Playout**: one Liquidsoap container per station (live/AutoDJ/silence fallback chain)
- **Streaming**: Icecast2 for listeners, plus HLS from Liquidsoap
- **Auth**: Sanctum tokens + Google OAuth (Socialite); short-lived HMAC tokens for WHIP publish
- **Observability**: Sentry (client + server)
- **Web Server**: FrankenPHP (Caddy) — TLS termination, static files, WHIP reverse proxy

## Audio Pipeline

```
Browser (getUserMedia / File) → WebRTC/WHIP ─┐
OBS → RTMP ──────────────────────────────────┼→ MediaMTX → RTSP ─┐
Pro rigs → SRT ──────────────────────────────┘                   │
                                                                 ▼
                       AutoDJ playlist.m3u ────────→  Liquidsoap (per station)
                                                       fallback: live > autodj > silence
                                                                 │
                                                    ┌────────────┴────────────┐
                                                    ▼                         ▼
                                          Icecast /stream/{slug}      HLS {slug}/playlist.m3u8
                                                    │                         │
                                                    └────────→ Listeners ◄────┘
```

Audio never stops: each station's Liquidsoap falls back from the live
broadcaster to the station's AutoDJ playlist to generated silence, so a mount
is always up and listeners are never dropped mid-reconnect.

## Project Structure

```
gocast/
├── api/                # Laravel 13 API
├── client/             # Next.js 16 app (SPA-style App Router)
├── infra/
│   ├── icecast/        # Icecast config template + entrypoint
│   ├── mediamtx/       # WHIP/RTMP/SRT ingest config
│   ├── liquidsoap/     # Per-station playout image
│   └── setup-host.sh   # Creates /var/gocast/*, network, liquidsoap image
├── docs/               # Specs, plans, runbooks (incl. PRODUCTION_DEPLOY.md)
├── docker-compose.yml  # Production stack (override file adds dev conveniences)
├── deploy.sh           # Pull, build, migrate, relaunch stations
├── backup.sh           # MySQL + uploads + playlists → object storage
├── GO-LIVE.md          # Launch-readiness punch list
└── api-reference.md    # Full HTTP API reference
```

## Features (current)

- Station CRUD with plan-based limits (free / starter / pro / studio)
- Browser-based broadcaster (mic + file queue) publishing over WebRTC/WHIP
- AutoDJ library per station: upload tracks, drag to reorder, plays when nobody's live
- Public player page per station (`/station/{slug}`) with embed variant
- Station discovery page (genre filter, live now)
- "Notify me when live" email capture on offline stations
- Listener library (recently played) stored client-side
- Account self-service: profile, password, delete account
- Waitlist capture for pricing tiers
- Inactive-broadcaster nudge email (day-7 drip)
- Always-on mount per station so listeners don't drop on broadcaster reconnects
- Live listener counts polled from Icecast every minute

## Getting Started

### Prerequisites

- PHP 8.3+ / Composer
- Node.js 20+
- Docker & Docker Compose
- Icecast2 on host (local or remote)

### Setup

1. Start MySQL and Redis:
   ```bash
   docker compose up -d
   ```

2. API:
   ```bash
   cd api
   composer install
   cp .env.example .env
   php artisan key:generate
   php artisan migrate --seed
   php artisan serve
   ```

3. Client:
   ```bash
   cd client
   npm install
   npm run dev
   ```

See `infra/icecast/README.md` for Icecast + Liquidsoap standby setup on a production host.

## License

MIT
