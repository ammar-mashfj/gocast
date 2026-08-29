# GoCast

A freemium internet radio streaming platform. Broadcast live audio from your browser, get a shareable player page, and listeners tune in instantly. No downloads, no server setup.

## Tech Stack

- **API**: Laravel 13 + Sanctum + MySQL 8 + Redis
- **Client**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Ingest**: Liquidsoap `input.harbor` — the webcast WebSocket protocol from the browser studio, and the classic Icecast source protocol for BUTT/Mixxx
- **Playout**: one Liquidsoap container per station (live/AutoDJ/silence fallback chain)
- **Streaming**: Icecast2 for listeners, plus HLS from Liquidsoap
- **Auth**: Sanctum tokens + Google OAuth (Socialite); a shared internal key for station-container callbacks
- **Observability**: Sentry (client + server), optional Grafana Alloy
- **Web server**: nginx + php-fpm on the host — TLS termination, static files, ingest and HLS routing

## Deployment shape

Everything is a host service — nginx, php-fpm, MySQL, Redis, Icecast, and
three systemd units for the queue worker, scheduler and Next.js server.

Docker is installed for exactly one thing: **one Liquidsoap container per
on-air station**, spawned by `App\Services\LiquidsoapSupervisor` as stations
are switched on and off. Two small support containers serve those (a Docker
socket proxy and a station router). Nothing else is containerised.

The runbook is [`infra/native/README.md`](infra/native/README.md).

## Audio Pipeline

```
Browser studio ──── wss://stream.../broadcast/{slug} ───┐
BUTT / Mixxx ────── Icecast source protocol ────────────┤
                                                        ▼
                                            Liquidsoap input.harbor
                                                        │
                     AutoDJ (tracks served one at a     │
                     time by Laravel over the internal ─┤
                     API) ──────────────────────────────┤
                                                        ▼
                                          Liquidsoap (one per station)
                                       fallback: live > autodj > silence
                                                        │
                                        ┌───────────────┴───────────────┐
                                        ▼                               ▼
                              Icecast /stream/{slug}          HLS {slug}/playlist.m3u8
                                        │                               │
                                        └──────── Listeners ◄───────────┘
```

Audio never stops while a station is on: each station's Liquidsoap falls back
from the live broadcaster to the station's AutoDJ rotation to generated
silence, so the mount is held and listeners are not dropped mid-reconnect.

## Project Structure

```
gocast/
├── api/                     # Laravel 13 API
├── client/                  # Next.js 16 app (SPA-style App Router)
├── infra/
│   ├── liquidsoap/          # Per-station playout image (the only Dockerfile)
│   ├── alloy/               # Optional Grafana Alloy config (host service)
│   └── native/              # THE deployment kit — start at its README
│       ├── setup-native.sh          # one-time host provisioning
│       ├── deploy-native.sh         # steady-state deploy
│       ├── docker-compose.native.yml# the network + two support containers
│       ├── nginx/ php/ systemd/ icecast/
│       └── station-router/          # resolves station containers for nginx
├── docs/                    # Specs, plans, flow docs
├── backup.sh                # MySQL + uploads + TLS + playlists → object storage
├── GO-LIVE.md               # Launch-readiness punch list
└── api-reference.md         # Full HTTP API reference
```

## Features (current)

- Station CRUD with plan-based limits (free / starter / pro / studio)
- Browser-based broadcaster (mic + file queue) publishing over a WebSocket
- AutoDJ library per station: upload tracks, drag to reorder, plays when nobody's live
- Loudness analysis and silence trimming on upload, applied as playback annotations
- Public player page per station (`/station/{slug}`) with embed variant
- Station discovery page (genre filter, live now)
- "Notify me when live" email capture on offline stations
- Listener library (recently played) stored client-side
- Account self-service: profile, password, delete account
- Waitlist capture for pricing tiers
- Inactive-broadcaster nudge email (day-7 drip)
- Auto-stop for idle and silent stations
- Live listener counts polled from Icecast every minute

## Getting Started (local development)

### Prerequisites

- PHP 8.4 / Composer
- Node.js 20+
- Docker (for the station containers only)
- `redis-server` and `icecast2` as host packages

Local development runs the same shape as production, so there is no separate
dev stack. Full instructions, including the three `api/.env` values that
differ on a laptop, are in the **Local development** section of
[`infra/native/README.md`](infra/native/README.md).

```bash
sudo apt install -y redis-server icecast2 docker.io
docker compose -f infra/native/docker-compose.native.yml up -d

cd api    && composer install && cp .env.example .env && php artisan key:generate
php artisan migrate --seed && php artisan serve

cd client && npm install && npm run dev
```

## License

MIT
