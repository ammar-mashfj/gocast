# GoCast

A freemium internet radio streaming platform. Broadcast live audio from your browser, get a shareable player page, and listeners tune in instantly. No downloads, no server setup.

## Tech Stack

- **API**: Laravel 13 + Sanctum + Filament 4 (admin) + MySQL 8 + Redis
- **Client**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Relay**: Node.js + WebSocket (`ws`)
- **Streaming**: Icecast2 with Liquidsoap standby fallback
- **Auth**: Sanctum tokens + Google OAuth (Socialite)
- **Observability**: Sentry (client + server)
- **Web Server**: Nginx (TLS termination, reverse proxy, WebSocket upgrade)

## Audio Pipeline

```
Browser (getUserMedia / File) → lamejs MP3 encode → WebSocket → Node relay → Icecast → Listeners
                                                                      ↓
                                                           (fallback to /standby.mp3
                                                            fed by Liquidsoap on
                                                            broadcaster drop)
```

## Project Structure

```
gocast/
├── api/                # Laravel 13 API + Filament admin panel
├── client/             # Next.js 16 app (SPA-style App Router)
├── relay/              # Node.js WebSocket-to-Icecast relay
├── infra/
│   └── icecast/        # Icecast config + Liquidsoap standby feeder
├── docs/               # Specs, plans, runbooks
├── docker-compose.yml  # MySQL + Redis for local dev
├── GO-LIVE.md          # Launch-readiness punch list
└── api-reference.md    # Full HTTP API reference
```

## Features (current)

- Station CRUD with plan-based limits (free / starter / pro / studio)
- Browser-based broadcaster (mic + file queue, MP3 encode in-page)
- Public player page per station (`/station/{slug}`) with embed variant
- Station discovery page (genre filter, live now)
- "Notify me when live" email capture on offline stations
- Listener library (recently played) stored client-side
- Account self-service: profile, password, delete account
- Waitlist capture for pricing tiers
- Filament admin dashboard: users, stations, sessions, plans, waitlist, activity & auth logs
- Inactive-broadcaster nudge email (day-7 drip)
- Standby audio mount so listeners don't drop on broadcaster reconnects

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

4. Relay:
   ```bash
   cd relay
   npm install
   node index.js
   ```

See `infra/icecast/README.md` for Icecast + Liquidsoap standby setup on a production host.

## License

MIT
