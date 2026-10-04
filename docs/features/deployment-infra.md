---
feature: Deployment and infrastructure
verified: 2026-10-04 against e145a37 plus uncommitted work
sources:
  - infra/native/setup-native.sh
  - infra/native/deploy-native.sh
  - infra/native/docker-compose.native.yml
  - infra/native/verify-ingest.sh
  - infra/native/nginx/gocast-api.conf
  - infra/native/nginx/gocast-app.conf
  - infra/native/nginx/gocast-icecast.conf
  - infra/native/nginx/gocast-stream.conf
  - infra/native/php/99-gocast.ini
  - infra/native/php/gocast.pool.conf
  - infra/native/systemd/gocast-client.service
  - infra/native/systemd/gocast-queue.service
  - infra/native/systemd/gocast-scheduler.service
  - infra/native/icecast/icecast.xml.tpl
  - infra/native/env/api.env.example
  - infra/native/env/domains.env.example
  - infra/native/station-router/Dockerfile
  - infra/native/station-router/nginx.conf
  - infra/native/station-router/ingest.js
  - infra/liquidsoap/Dockerfile
  - infra/liquidsoap/standby.liq
  - infra/alloy/config.alloy
  - backup.sh
  - api/.dockerignore
  - api/routes/console.php
  - api/bootstrap/app.php
  - api/config/liquidsoap.php
  - api/config/cors.php
  - api/config/sanctum.php
  - api/config/session.php
  - api/config/services.php
  - api/config/broadcasting.php
  - api/config/queue.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Services/TrackAnalyzer.php
  - api/app/Jobs/AnalyzeTrack.php
  - api/app/Console/Commands/SyncListenerCounts.php
  - api/app/Http/Middleware/UseAuthTokenCookie.php
  - api/app/Http/Middleware/VerifyInternalKey.php
  - api/app/Http/Controllers/AuthController.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Events/StationStateChanged.php
  - client/next.config.ts
  - client/proxy.ts
  - client/lib/env.ts
  - client/app/hls-proxy/[...path]/route.ts
fingerprint: 5e96859b62244916
---

# Deployment and infrastructure

GoCast runs on one Linux host. **Laravel, Next.js, MySQL, Redis and Icecast are ordinary host services** (nginx + php-fpm, systemd units, apt packages). **Docker exists for one reason: Liquidsoap.** Every on-air station is its own `docker run` container, spawned by `LiquidsoapSupervisor`, plus two permanent support containers (a Docker socket proxy and the "station router"). There is no root `docker-compose.yml`, no `api/Dockerfile` and no `client/Dockerfile` (none exist on disk; the tracked `api/.dockerignore` is a leftover). The only compose file is `infra/native/docker-compose.native.yml`.

The thing people get wrong: **`docker compose` here does not run the app.** It starts exactly two containers. Everything else is systemd. A second wrong assumption is that a deploy restarts stations: it does not, and a change to the Liquidsoap image or the `.liq` template only reaches a running station after a manual `stations:relaunch`.

This doc covers the deployment kit under `infra/`, `backup.sh`, the scheduler, ports, domains, cookies and CORS. What a station container does inside is in [Liquidsoap station script](liquidsoap-station-script.md); how containers are started, checked and reconciled is in [Liquidsoap supervisor](liquidsoap-supervisor.md) and [Station lifecycle](station-lifecycle.md); encoder ingest behaviour is in [Encoder ingest](encoder-ingest.md); the local setup is in [Dev environment and testing](dev-environment-and-testing.md); env vars in full are in [Configuration reference](configuration-reference.md).

## Repo layout (deployment-relevant)

| Path | What it is |
|---|---|
| `infra/native/setup-native.sh` | Host provisioning. Idempotent, root only. Renders every config from templates. |
| `infra/native/deploy-native.sh` | Incremental deploy. Root only, drops to `RUN_USER` via `sudo -u`. |
| `infra/native/docker-compose.native.yml` | The two permanent containers plus the `gocast-network` definition. |
| `infra/native/nginx/*.conf` | Four vhost templates with `__TOKEN__` placeholders (port-80 only; certbot adds TLS). |
| `infra/native/php/` | php-fpm pool `gocast.pool.conf` and `99-gocast.ini`. |
| `infra/native/systemd/` | `gocast-queue`, `gocast-scheduler`, `gocast-client` units. |
| `infra/native/icecast/icecast.xml.tpl` | Icecast config, rendered with `envsubst`. |
| `infra/native/station-router/` | Dockerfile (nginx 1.29.8 + njs), `nginx.conf`, `ingest.js`. |
| `infra/native/env/` | `domains.env.example`, `api.env.example`. `domains.env` (real values) is gitignored and present on disk. |
| `infra/native/verify-ingest.sh` | Manual end-to-end probe of encoder ingest. |
| `infra/liquidsoap/Dockerfile`, `standby.liq` | The station image. `reference-station.liq` and `infra/liquidsoap/README.md` exist but nothing loads them. |
| `infra/alloy/config.alloy` | Grafana Alloy config (host service, not shipped by any script). |
| `backup.sh` | Nightly backup to S3-compatible storage. Run from cron, not the scheduler. |
| `infra/mediamtx/mediamtx.yml/` | An **empty, root-owned directory** (named like a file), untracked. Dead leftover from the MediaMTX design; nothing reads it. |

## Process and port map

Defaults come from `domains.env.example` and `api.env.example`. "Bind" is what the code/config binds, not what the firewall allows.

| What | Runs as | Listens / port | Bind | Reached by | Source |
|---|---|---|---|---|---|
| nginx (public vhosts) | host service | 80 (certbot adds 443) | all | Internet (via Cloudflare in prod) | `nginx/*.conf` |
| nginx internal vhost | host nginx | `INTERNAL_API_PORT` 8081 | all IPv4 interfaces (`listen __INTERNAL_API_PORT__;`, no `[::]` line). Serves only `/api/internal/*` and `/up`; every other path is 404; `client_max_body_size 2M`, `fastcgi_read_timeout 30s` | Station containers via `host.docker.internal` (`LIQUIDSOAP_API_URL`); the deploy health gate | `gocast-api.conf` |
| Laravel API | php-fpm pool `gocast` | unix socket `/run/php/php8.4-fpm-gocast.sock` | socket, mode 0660, owner `www-data` | both nginx server blocks | `gocast.pool.conf` |
| Next.js client | `gocast-client.service`, `node server.js` (standalone) | `CLIENT_PORT` 3000 | `HOSTNAME=127.0.0.1` | `gocast.fm` vhost upstream | `gocast-client.service` |
| Queue worker | `gocast-queue.service` | none | n/a | Redis | see below |
| Scheduler | `gocast-scheduler.service` (`schedule:work`) | none | n/a | Redis, MySQL, Docker proxy | see below |
| MySQL | apt | 3306 | loopback (`DB_HOST=127.0.0.1`) | Laravel | `api.env.example` |
| Redis | apt | 6379 | loopback | Laravel: cache, sessions, queue, listener counts | `api.env.example` |
| Icecast | apt `icecast2` | `ICECAST_PORT` 8000 | **all interfaces** (needed so containers reach it at 172.17.0.1) | nginx `icecast.` vhost (loopback), station containers (SOURCE), Laravel (`/admin/stats`) | `icecast.xml.tpl` |
| `gocast-docker-proxy` container | `tecnativa/docker-socket-proxy:v0.5.0` (healthcheck `wget /_ping`, 15s) | 2375 | published `127.0.0.1:2375` | php-fpm, queue, scheduler (`DOCKER_HOST=tcp://127.0.0.1:2375`) | compose |
| `gocast-station-router` container | `gocast/station-router:1.29.8`, memory limit 128M, healthcheck `wget http://127.0.0.1:8091/healthz` every 30s (that route answers `ok` in the router) | 8091 (HTTP) and container 8000 (TCP ingest) | 8091 published `127.0.0.1:8091`; ingest published `0.0.0.0:${INGEST_PORT:-8010}` -> 8000 | 8091: nginx `stream.` vhost. Ingest: BUTT/Mixxx directly from the Internet | compose, `station-router/nginx.conf` |
| Router, internal servers | inside router container | 127.0.0.1:8092 (OPTIONS probe answers), 127.0.0.1:8093 (metadata rewrite) | container loopback | `ingest.js` | `station-router/nginx.conf` |
| Station container `gocast-liquidsoap-{slug}` | `docker run -d`, one per on-air station | 8090 (harbor ingest: webcast WebSocket + Icecast SOURCE), 8080 (harbor HTTP `/status`, `/healthz`), 1234 (telnet, bound `0.0.0.0`) | inside `gocast-network`, **nothing published** | router (8090), Laravel (8080, 1234, by container IP) | supervisor, `station.blade.php` |
| Grafana Alloy | host service, optional | none | n/a | outbound to Grafana Cloud | `config.alloy` |

**There is no Reverb or websocket server on this host.** Realtime goes through Ably using the Pusher protocol: `BROADCAST_CONNECTION=pusher` with `PUSHER_HOST=main.pusher.ably.net` (`api/config/broadcasting.php`, `api.env.example`). The default when unset is `log` (kill switch). The browser side is `NEXT_PUBLIC_PUSHER_KEY` / `_HOST` / `_PORT`; an empty key makes `client/lib/env.ts` `broadcastKey` empty and the client falls back to polling. See [Realtime events](realtime-events.md).

### Docker network

`gocast-network` is declared in the compose file: subnet `172.28.0.0/16`, `ip_range 172.28.255.0/24`. Each station gets a fixed address, `container_subnet` base + `container_index` + 2 (`LiquidsoapSupervisor::containerIp()`, config `LIQUIDSOAP_CONTAINER_SUBNET`, default `172.28.0.0/16`), passed as `--ip`. The `ip_range` keeps Docker's own auto-assignment (router, proxy) at the top of the block, away from station addresses. A station whose index falls outside the block throws instead of wrapping. Laravel (on the host) reaches containers by that IP (`LIQUIDSOAP_TELNET_RESOLVE=ip`); Docker's embedded DNS (`127.0.0.11`) only works from inside containers, which is how the router resolves `gocast-liquidsoap-{slug}`.

`host.docker.internal` inside a station is `--add-host host-gateway`, which resolves to the **default bridge gateway 172.17.0.1**, not loopback. That is why Icecast and the internal vhost bind all interfaces and the firewall carries the protection.

## Domains, TLS and Cloudflare

Four hostnames, all rendered from `domains.env` (`APP_HOST`, `API_HOST`, `ICECAST_HOST`, `STREAM_HOST`; examples `gocast.fm`, `api.gocast.fm`, `icecast.gocast.fm`, `stream.gocast.fm`).

| Host | Vhost | Serves |
|---|---|---|
| `APP_HOST` | `gocast-app.conf` | Proxies everything to `127.0.0.1:CLIENT_PORT` (keepalive 32, `proxy_read_timeout 60s`, `client_max_body_size 12M`). `www.` 301-redirects to the bare host, but only on port 80: the certbot command in `setup-native.sh` names four hosts and not `www.`, so `https://www.` has no certificate. Adds `X-Content-Type-Options` and `Referrer-Policy`. Next itself adds `X-Frame-Options: DENY` except under `/embed`. |
| `API_HOST` | `gocast-api.conf` | Laravel `public/`. `client_max_body_size 640M`, `client_body_timeout 900s`, `fastcgi_read_timeout 900s`. `X-Frame-Options SAMEORIGIN`. `/storage/` served straight from disk with `expires 7d`. Dotfiles denied except `.well-known`. Also serves `/admin/*` (Blade admin panel), `/up`, `/broadcasting/auth` and, publicly, `/api/internal/*` (guarded only by the `X-Internal-Key` header, `VerifyInternalKey`, plus the `internal` throttle). Sends `HTTP_PROXY ""` to fastcgi. |
| `ICECAST_HOST` | `gocast-icecast.conf` | Proxies to `127.0.0.1:ICECAST_PORT` with buffering off and 24h timeouts. Answers `OPTIONS` itself (204, `Access-Control-Allow-Origin *`, allowed headers `Range, Icy-MetaData`). **`/admin/` is `deny all`.** |
| `STREAM_HOST` | `gocast-stream.conf` | (1) `^/broadcast/{slug}$` (slug regex `[a-z0-9][a-z0-9-]{0,62}`) proxied to the router on `ROUTER_PORT` with WebSocket upgrade and 24h timeouts. (2) `*.m3u8` from `/var/gocast/hls`, `Cache-Control: no-cache`, CORS `*`. (3) `*.ts|aac|mp4|m4s` from the same directory, `public, max-age=31536000, immutable`, CORS `*`. (4) everything else 404. |

TLS: the templates are port 80 only. `certbot --nginx -d <four hosts>` rewrites them in place. Certbot state lives in `/etc/letsencrypt` (which `backup.sh` archives). Prod sits behind Cloudflare in Full mode (per `infra/native/README.md` and the privacy page, `client/app/(marketing)/privacy/page.tsx`).

**What in code assumes Cloudflare:**

- `analytics.country_header` defaults to `CF-IPCountry` (`api/config/analytics.php`, `ANALYTICS_COUNTRY_HEADER`); `GeoResolver` treats `XX` and `T1` as unknown. Without Cloudflare there is no country data.
- `bootstrap/app.php` `trustProxies(at: '*', ...)` honours `X-Forwarded-For/Host/Port/Proto` from any peer.
- **Nothing in `infra/` sets `set_real_ip_from`.** nginx passes `X-Forwarded-For` (`$proxy_add_x_forwarded_for`) and `X-Real-IP $remote_addr`, and behind Cloudflare `$remote_addr` is Cloudflare's address. Correct client IPs depend entirely on Laravel reading the forwarded header.
- The router's ingest port (default 8010) is published **directly**, not through nginx or Cloudflare, because Cloudflare's proxy cannot carry raw TCP.

### Cookies and CORS

- **Auth cookie `token`**: written by the API (`AuthController::authCookie`, same shape in `GoogleAuthController`) with lifetime `sanctum.expiration` minutes (default 43200 = 30 days), path `/`, **domain `config('session.domain')`**, secure when the request is HTTPS, `httpOnly=true`, `sameSite=lax`. Production sets `SESSION_DOMAIN=.gocast.fm` so the cookie is shared by `gocast.fm` (Next's `proxy.ts` reads it, together with a separate `user` cookie whose JSON must carry `email_verified_at`, to guard `/dashboard`; with both present it also redirects `/auth/login` and `/auth/register` to `/dashboard/stations`, unless the URL carries `?expired=1`, which a dashboard page whose API call came back 401 sends so the stale cookies don't loop back to the same 401. Its matcher skips `api`, `embed`, `_next/static`, `_next/image`, `.png` and `.svg`.) and `api.gocast.fm`.
- `UseAuthTokenCookie` (prepended to the `api` middleware group) turns the `token` cookie into an `Authorization: Bearer` header if none was sent, using the **last** `token` cookie when several arrive, and, only when more than one `token` cookie arrived, adds a `Set-Cookie` that expires the host-only (no domain) duplicate.
- `session.driver` is `redis` in the example (`SESSION_DRIVER=redis`); the config default is `database`.
- **CORS** (`config/cors.php`): paths `api/*`, `sanctum/csrf-cookie`, `broadcasting/auth`; all methods and headers; `supports_credentials true`; `max_age 0`; origins from `CORS_ALLOWED_ORIGINS` (comma list). Example sets it to `"${FRONTEND_URL}"` (`https://gocast.fm`). Code default, when unset, is `http://localhost:5173,http://localhost:3000`.
- `sanctum.stateful` defaults to localhost hosts unless `SANCTUM_STATEFUL_DOMAINS` is set; the web app authenticates by bearer token, not the stateful cookie flow.
- Streaming CORS is handled at nginx and Icecast (`Access-Control-Allow-Origin *`), not by Laravel.
- Client build-time env: `NEXT_PUBLIC_API_URL=https://{API_HOST}/api`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ICECAST_URL=https://{ICECAST_HOST}`, `NEXT_PUBLIC_BROADCAST_AUTH_URL=https://{API_HOST}/broadcasting/auth`, plus the Pusher and Sentry ones (`deploy-native.sh` `build_client()`). **They are baked into the JS at build**; setting them in the systemd unit does nothing.
- Client runtime env (server side only, from optional `EnvironmentFile=-/etc/gocast/client.env`): `INTERNAL_API_URL` (server-side fetches prefer it over the public URL, `client/lib/env.ts`), `RENDER_API_KEY` (must equal the API's value), `LIQUIDSOAP_HLS_DIR` (dev-only). `client/next.config.ts` derives the allowed image host from `NEXT_PUBLIC_API_URL` (fallback `api.gocast.fm`) for `/storage/**`, and also allows `lh3.googleusercontent.com` (Google avatars) and `http://localhost:8000/storage/**`. In development only, it rewrites `/stream-proxy/*` to `INTERNAL_ICECAST_URL` (default `http://127.0.0.1:8888`). `/discover` (302) and `/roadmap` (301) redirect to `/`.

## Stream output layout

**Icecast.** One mount per station, `icecast_mount` = `/stream/{slug}` (model default, `Station.php` creating hook). The station container connects as SOURCE to `LIQUIDSOAP_ICECAST_HOST:LIQUIDSOAP_ICECAST_PORT` (default `host.docker.internal:8000`) with `ICECAST_SOURCE_PASSWORD`. Icecast limits: 500 clients, **50 sources**, queue 512 KB, client timeout 30s, source timeout 10s, burst 64 KB (mount burst 16 KB, queue 128 KB). No `fallback-mount`: the station container holds the source for as long as it runs. Listener counts: `stations:sync-listeners` calls `{ICECAST_INTERNAL_URL}/admin/stats` (default `http://127.0.0.1:8000`) with basic auth (5s timeout) every minute and writes `listeners:{station id}` to Redis with a 300s TTL for every non-deleted station (0 when its mount is absent from the stats). It returns failure without writing when the credentials are missing, Icecast is unreachable or answers non-2xx, so counts age out after 300s.

**HLS.** Written by Liquidsoap (`output.file.hls`) into `/data/hls` inside the container = `/var/gocast/hls/{slug}/` on the host: 4s segments, 5 in the playlist, 5 extra retained, `format="adts"` (raw AAC, 128k), playlist `playlist.m3u8` (master), media playlist `{hls_variant}.m3u8` (`LIQUIDSOAP_HLS_VARIANT`, default `aac`), segment name `{stream}_{bootEpoch}_{position}.aac`, state persisted in `state.json`. nginx serves the tree from the `stream.` vhost. The public URL is `{LIQUIDSOAP_HLS_BASE_URL}/{slug}/{variant}.m3u8` (`StationResource::hlsUrl()`); with `LIQUIDSOAP_HLS_BASE_URL` empty `hls_url` is `null` and the player uses the Icecast mount. In dev the Next route `/hls-proxy/[...path]` reads the same directory and **returns 404 unless `NODE_ENV=development`**.

**Ingest.** Browser studio: `LIQUIDSOAP_INGEST_URL` (example `wss://stream.gocast.fm/broadcast/{slug}`) -> nginx `stream.` -> router:8091 -> `gocast-liquidsoap-{slug}:8090/{slug}` (prefix stripped by `proxy_pass http://$upstream/$slug`). With the variable unset the API hands out `ws://{containerIP}:8090/{slug}` (dev only). External encoders: `LIQUIDSOAP_ENCODER_HOST` (blank in the examples, meaning the feature is reported unavailable) and `LIQUIDSOAP_ENCODER_PORT` (8010) -> router TCP stream block on container port 8000. `ingest.js` reads the first line of the connection (up to 4096 bytes, 5s preread timeout) and routes `SOURCE|PUT /{slug} HTTP/1.x` or `ICE/1.0` to `gocast-liquidsoap-{slug}:8090`, `OPTIONS` to the local 8092 responder, and `/admin/metadata` requests to 8093, which parses the mount out of the request and re-issues it as a GET to the right harbor. Everything else is refused. Limit: 10 concurrent connections per client IP (`limit_conn ingest_per_ip 10`). See [Encoder ingest](encoder-ingest.md) for why this is a TCP router and not an nginx `http` proxy.

## Station containers

Started by `LiquidsoapSupervisor::run()` (image `LIQUIDSOAP_IMAGE`, default `gocast/liquidsoap:latest`, built locally by `setup-native.sh` from `infra/liquidsoap/Dockerfile`, which is `FROM savonet/liquidsoap:v2.4.5` plus ffmpeg).

| Flag | Value |
|---|---|
| name | `gocast-liquidsoap-{slug}` |
| network / ip | `gocast-network` / computed, see above |
| restart | `unless-stopped` (survives a host reboot; `stations:reconcile` removes ones that should be off) |
| stop | `--stop-signal SIGTERM`, `--stop-timeout` = `LIQUIDSOAP_STOP_TIMEOUT` (5), clamped to at most 7 (Docker command timeout 10s minus 3) |
| labels | `gocast.station={slug}`, `gocast.station_id={id}` |
| logs | json-file, `max-size=10m`, `max-file=3` |
| security | `--cap-drop ALL`, `no-new-privileges`, `--pids-limit` `LIQUIDSOAP_CONTAINER_PIDS_LIMIT` (256), `--init` only if `LIQUIDSOAP_CONTAINER_INIT` |
| health | probe bash `/dev/tcp` to harbor `/healthz`; interval 15s, timeout 3s, retries 3, start period 45s (config `health_*`, disable with `LIQUIDSOAP_HEALTHCHECK=false`) |
| **CPU** | `--cpus` `LIQUIDSOAP_CONTAINER_CPUS`, default **0.5** |
| **Memory** | `--memory` and `--memory-swap` both `LIQUIDSOAP_CONTAINER_MEMORY`, default **512m** (the swap pin makes it a hard cap). Empty string disables both. |
| mounts | `{liq_dir}/{slug}.liq:/station.liq:ro`, `{playlists_dir}/{slug}:/data/playlists:ro`, `{hls_dir}/{slug}:/data/hls` (rw), `{system_dir}:/data/system:ro` (watermark clips, mounted always) |

Sizing that the code and docs disagree with the container cap: `config/liquidsoap.php` comments say 256m SIGKILLs every station at boot (exit 137, empty logs); 512m is the default now and `api.env.example` sets 512m. `verifyStarted()` waits `LIQUIDSOAP_START_VERIFY_DELAY_MS` (750) after `docker run -d` and reports an OOM-killed container as "ran out of memory while starting". Host directories are created by the app: `ensureDirectories()` makes `playlists/{slug}` and `hls/{slug}` mode 0777; `setup-native.sh` creates `/var/gocast/{liq,playlists,hls,system}` as `RUN_USER:101` mode 0775 (GID 101 is the `liquidsoap` group in the image).

Per-station disk: `LIQUIDSOAP_STATION_STORAGE_BYTES`, code default 3 GiB; `api/.env.example` says 3221225472 but **`infra/native/env/api.env.example` says 104857600 (100 MB)** and the native README repeats "100 MB default". Use whichever is in the deployed `api/.env`.

Deleted stations: soft delete, then `stations:prune-deleted` erases those older than `LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS` (30) along with the `.liq`, `hls/{slug}` and audio.

Docker access from PHP: `DOCKER_HOST=tcp://127.0.0.1:2375` in three places, because `config:cache` stops Laravel loading `.env` and php-fpm clears the environment: `env[DOCKER_HOST]` and `env[PATH]` in the pool file, `Environment=DOCKER_HOST=` in the queue and scheduler units, and explicitly across `sudo` in `deploy-native.sh` `artisan()`. Keep the `api/.env` line as well. The proxy allows `CONTAINERS`, `NETWORKS`, `IMAGES` and `POST`, `EXEC=0`. It filters by path and method, not body, so anyone who can run PHP can still `POST /containers/create` with any bind mount; it keeps the `gocast` user off the raw socket but is not a sandbox. (The supervisor talks to station telnet over TCP precisely to avoid needing `EXEC`.) Track analysis also goes through it: with `LIQUIDSOAP_ANALYSIS_FFMPEG` empty, `TrackAnalyzer` runs `docker run --rm --network none --entrypoint ffmpeg` on the station image with the file mounted read-only.

## Provisioning: `setup-native.sh`

Root only. Reads `infra/native/env/domains.env` (required keys: `APP_HOST API_HOST ICECAST_HOST STREAM_HOST APP_ROOT RUN_USER PHP_VERSION CLIENT_PORT ICECAST_PORT ROUTER_PORT INTERNAL_API_PORT INGEST_PORT DOCKER_HOST_ADDR`). In order:

1. Refuses to run if `INGEST_PORT` equals `ICECAST_PORT`, `ROUTER_PORT`, `CLIENT_PORT` or `INTERNAL_API_PORT`.
2. Creates system user `RUN_USER` (home `/srv/{user}`, shell `/bin/bash`).
3. Creates `/var/gocast/{liq,playlists,hls,system}` (`RUN_USER:101`, 0775).
4. Warns if a `gocast-network` exists without an `ip_range` (does not fix it).
5. `docker build -t gocast/liquidsoap:latest infra/liquidsoap/`.
6. Renders the four vhosts into `/etc/nginx/sites-available` and symlinks into `sites-enabled`; **deletes `sites-enabled/default`**.
7. Renders the php-fpm pool to `/etc/php/{ver}/fpm/pool.d/gocast.conf` and `99-gocast.ini` into both `fpm` and `cli` `conf.d`.
8. Renders the three systemd units into `/etc/systemd/system` and runs `daemon-reload` (does not enable or start them; the README does that).
9. If `api/.env` exists, sources it (after `unset DOCKER_HOST`), and renders `/etc/icecast2/icecast.xml` with `envsubst` limited to the four Icecast variables (root:icecast, 0640); sets `ENABLE=true` in `/etc/default/icecast2`. Skips with a warning if `ICECAST_SOURCE_PASSWORD` is unset; hard-fails on missing `ICECAST_ADMIN_PASSWORD`. `ICECAST_RELAY_PASSWORD` defaults to the source password, `ICECAST_ADMIN_USER` to `admin`.
10. `docker compose -f docker-compose.native.yml up -d --build` (proxy + router; creates `gocast-network`).
11. ufw (if installed): allow 80, 443; allow `ICECAST_PORT` and `INTERNAL_API_PORT` from the `gocast-network` subnet (read back from Docker) and from `172.17.0.0/16`. It never opens `INGEST_PORT` (Docker publishes it ahead of ufw, so it is public whatever ufw says). Prints a warning if ufw is missing.

It does **not** install packages, create the database, write `api/.env`, request certificates, or enable services. Re-running it overwrites the vhosts and removes certbot's `:443` blocks (see traps).

### php-fpm and PHP limits

Pool `[gocast]`: user/group `RUN_USER`; `pm = dynamic`, `max_children 12`, `start_servers 3`, `min_spare 2`, `max_spare 5`, `max_requests 500`; slowlog after 10s to `/var/log/php{ver}-fpm-gocast-slow.log`; `request_terminate_timeout = 330s`; `catch_workers_output = yes`; `open_basedir = {APP_ROOT}/api:/var/gocast:/tmp:/usr/share/php:/dev/urandom`; error log `/var/log/php{ver}-fpm-gocast.log`.

`99-gocast.ini` (fpm and cli): `upload_max_filesize 320M`, `post_max_size 640M`, `max_file_uploads 30`, `max_input_time 900`, `max_execution_time 900`, `memory_limit 512M`; OPcache on (256 MB, 20000 files, `validate_timestamps=1`, `revalidate_freq=2`, `save_comments=1`, CLI off); `expose_php Off`; `display_errors Off`; session cookie httponly/Lax/strict mode.

### systemd units

| Unit | Command | Notable |
|---|---|---|
| `gocast-queue` | `php artisan queue:work --queue=realtime,default --tries=3 --timeout=60 --max-time=3600` | `Requires=redis-server`; `Restart=always`, `RestartSec=5`, `TimeoutStopSec=90`; hardened with `NoNewPrivileges`, `PrivateTmp`, kernel/cgroup protections. ONE worker. |
| `gocast-scheduler` | `php artisan schedule:work` | `Requires=redis-server`, `After=docker.service`; `RestartSec=10`, `TimeoutStopSec=70`. |
| `gocast-client` | `/usr/bin/node server.js` in `client/.next/standalone` | `PORT`, `HOSTNAME=127.0.0.1`, `NODE_ENV=production`; `ProtectSystem=strict`, `ProtectHome=true`, writable only `.next/cache` under standalone. Node must be at `/usr/bin/node`. |

The `realtime` queue exists only for `StationStateChanged` broadcasts (`broadcastQueue()`); a worker started without `--queue=realtime,default` never delivers them. `queue.redis.retry_after` is 1800 (`REDIS_QUEUE_RETRY_AFTER`; `REDIS_QUEUE_BLOCK_FOR` 5). It must stay above the longest job timeout: `AnalyzeTrack` sets its own `$timeout` to `TrackAnalyzer::timeoutFor(duration) + 30`, where `timeoutFor` is `max(LIQUIDSOAP_ANALYSIS_TIMEOUT floor (120), ceil(duration/8))` capped at `MAX_TIMEOUT_SECONDS` 1500. A job's own `$timeout` overrides the worker's `--timeout=60`. At the old 90 s a second worker could take a long mix mid-analysis and run ffmpeg twice.

## Deploy: `deploy-native.sh`

Usage: `sudo bash infra/native/deploy-native.sh`, or `sudo FULL_DEPLOY=1 ...` to ignore the diff. Runs `git pull --ff-only` in the checkout, then diffs the last **successful** deploy (`/var/lib/gocast/deployed-ref`, override `DEPLOYED_REF_FILE`) against HEAD. No stamp means every step runs.

| Trigger (changed since last good deploy) | Step |
|---|---|
| `api/database/migrations` | `mysqldump --single-transaction --routines --triggers` (as gzip, `/var/backups/gocast/pre-deploy-*.sql.gz`, keep `BACKUP_KEEP`=10) then `artisan migrate --force`. Skippable with `SKIP_DB_BACKUP=1`; refuses to migrate without `mysqldump` otherwise. |
| `api/composer.lock` or `composer.json` | `composer install --no-dev --optimize-autoloader --classmap-authoritative` |
| any `api/` change (no composer change) | `composer dump-autoload ... --classmap-authoritative` (needed because PSR-4 lookup is off) |
| `api/package(-lock).json` | `npm ci --include=dev` in `api/` |
| `api/resources`, `vite.config.js`, package files | `npm run build` (admin Blade assets, `public/build`; without it `/admin` 500s) |
| `client/package(-lock).json` | `npm ci` in `client/` |
| any `client/` change, or `domains.env` hash changed | `next build`, then copy `public/` and `.next/static` into `.next/standalone`, and recreate `.next/standalone/.next/cache` |
| any `api/` change | `storage:link --relative`, `view:clear`, `config:clear`, `config:cache`, `route:cache`, `event:cache`, `systemctl reload php{ver}-fpm`, `artisan queue:restart`, `systemctl restart gocast-scheduler` |
| client rebuilt | `systemctl restart gocast-client` |
| always | health gate: `curl http://127.0.0.1:${INTERNAL_API_PORT}/up` up to 20 tries, 3s apart; then `artisan stations:reconcile` (failure ignored); then stamp the ref and `domains.env` hash |

Safety model: any failed step calls `rollback()`, which `git reset --hard` to the last good ref, rebuilds the autoloader, re-caches config, reloads fpm, restarts queue and scheduler, and rebuilds the client if a build had started. **The database is never rolled back**; it prints the pre-migration dump path instead. A deploy that touches only `client/` never reloads fpm, and an API-only deploy never restarts Next.

Owed-manual-steps warnings it prints but does not perform: `infra/native` or `domains.env` changed (run `setup-native.sh` then certbot); `station-router` changed (`setup-native.sh` rebuilds it, and restarting it drops every encoder mid-broadcast); `infra/liquidsoap` changed (rebuild the image and `stations:relaunch`); `.liq` template or `LiquidsoapSupervisor.php` changed (`stations:relaunch`, about a 3s blip per station and live DJs disconnect).

## Scheduled commands

`api/routes/console.php`. Driven by the single `gocast-scheduler` unit (`schedule:work`, which runs `schedule:run` each minute). Timezone is `UTC` (`config/app.php`), so `dailyAt` times are UTC. Commands marked "background" use `runInBackground()`; all use `withoutOverlapping()`, whose lock lives in Redis.

| Command | Cadence | Mode | What it does |
|---|---|---|---|
| `stations:sync-listeners` | every minute | background | Polls Icecast `/admin/stats`, writes `listeners:{id}` to Redis (TTL 300s). |
| `stations:reconcile` | every minute | background | Converges containers onto the station table; unhealthy passes before recreate `LIQUIDSOAP_UNHEALTHY_PASSES` (2), recreates per hour cap `LIQUIDSOAP_UNHEALTHY_RECREATES_PER_HOUR` (3), stranded-session strikes `LIQUIDSOAP_STRANDED_SESSION_STRIKES` (3). |
| `stations:sweep` | every minute | background | The auto-stop decision tree (`LIQUIDSOAP_SILENT_STOP_SECONDS` 600, `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` 150). |
| `listeners:sweep` | every minute | background | Closes idle listener sessions and samples concurrency. One-minute cadence is load-bearing for `listener_minutes`. |
| `listeners:rollup` | hourly at :05 | background | Recomputes session-derived rollups over a trailing window. |
| `listeners:prune` | daily 04:20 | background | Deletes sessions older than `analytics.retention_days` (90). |
| `stations:prune-deleted` | daily 04:40 | background | Erases stations soft-deleted longer than 30 days. |
| `stations:prune-events` | daily 04:50 | background | Deletes station events older than `station_events.retention_days` (30). |
| `notifications:prune` | daily 05:00 | background | Deletes notifications older than `notifications.retention_days` (90). |
| `app:nudge-inactive-broadcasters` | daily 16:00 UTC | **foreground** | Day-7 nudge email. |
| `plans:expire` | hourly | **foreground** | Downgrades accounts whose `plan_expires_at` has passed. |

Commands that exist but are **not scheduled** (run by hand or by a caller): `stations:relaunch`, `tracks:analyze` (backfill), `notifications:announce` (`SendAnnouncement`), `admin:create`, `admin:reset-password`, `e2e:auth` (`E2EAuthCommand`, refuses outside local/testing). `--dry-run` exists on `stations:reconcile`, `stations:sweep`, `stations:prune-deleted`, `notifications:announce` and `app:nudge-inactive-broadcasters`.

The scheduler is one process by design. `stations:reconcile` running twice at once would race itself tearing containers down; the Redis-backed overlap lock covers a normal single scheduler.

## Backups: `backup.sh`

Not in the scheduler. Intended for root cron (`0 3 * * *` per its header, path shown as `/opt/gocast/backup.sh`, although the documented checkout is `/srv/gocast/app`). It `cd`s to its own directory, sources `api/.env`, requires `BACKUP_S3_BUCKET` and `DB_PASSWORD`, and uploads four archives with `aws s3 cp` (works with R2/B2/MinIO through `AWS_ENDPOINT_URL_S3`):

| Object prefix | Contents |
|---|---|
| `mysql/` | `mysqldump --single-transaction --routines --triggers --quick | gzip` |
| `uploads/` | `api/storage/app/public` (station artwork etc.) |
| `letsencrypt/` | `/etc/letsencrypt` minus `archive/` |
| `playlists/` | `/var/gocast/playlists` (user audio) |

Retention is left to a bucket lifecycle rule (30 days suggested). Not backed up: `api/.env`, `domains.env`, `/etc/icecast2/icecast.xml`, `/var/gocast/system` (watermark clips), `/var/gocast/liq` (regenerable), `/var/gocast/hls` (ephemeral), Redis. `BACKUP_S3_BUCKET` and the S3 destination are documented only in the script header; neither env example lists them.

## Observability: Alloy

`infra/alloy/config.alloy` is a host service config, not installed by any script. It ships to Grafana Cloud using six `GRAFANA_CLOUD_*` values from `/etc/default/alloy`: Docker discovery (label `gocast.station`, refresh 5s) for station container logs with labels `station`, `container`, `service=liquidsoap`; files `/srv/gocast/app/api/storage/logs/*.log`, `/var/log/nginx/gocast-*.log`, `/var/log/php8.4-fpm.log`, `/var/log/icecast2/*.log`; journal units `gocast-queue`, `gocast-scheduler`, `gocast-client`; and host metrics via `prometheus.exporter.unix`. The Icecast status scrape is commented out. Sentry is separate (Laravel `sentry/sentry-laravel`, Next `@sentry/nextjs` with tunnel route `/monitoring`). See [Observability and events](observability-and-events.md).

## Gaps and traps

1. **`setup-native.sh` wipes certbot's TLS blocks.** It re-renders port-80-only templates over the certbot-edited vhosts. `deploy-native.sh` does **not** call it (its header says so and the code confirms), but it prints an owed manual step whenever `infra/native` or `domains.env` changes. After any run of the setup script, run `certbot --nginx --cert-name <name>` or Cloudflare Full mode returns 521. `infra/native/README.md` claims the deploy re-runs the provisioner unconditionally; that is stale, the code wins.
2. **README says the deploy "relaunches" stations.** `deploy-native.sh` only runs `stations:reconcile` (starts missing, removes unwanted, leaves healthy ones alone). Image or `.liq` changes need `stations:relaunch` by hand.
3. **`request_terminate_timeout = 330s` is shorter than the rest of the upload path.** nginx `fastcgi_read_timeout 900s`, `client_body_timeout 900s`, PHP `max_execution_time 900`, but php-fpm kills a worker at 330s. The pool comment still says `memory_limit` 256M and `max_execution_time` 300s; the ini says 512M and 900s. A slow multi-hundred-MB upload can be cut at 330s with a 502 and nothing in the Laravel log.
4. **Track analysis timeouts are coupled across three files.** `TrackAnalyzer::timeoutFor()` scales the ffmpeg process timeout with track length (floor 120 s, `duration/8`, ceiling 1500 s); `AnalyzeTrack::$timeout` adds 30 s as the worker backstop; `config/queue.php` `retry_after` (1800) must clear that. Raising `MAX_TIMEOUT_SECONDS` without raising `REDIS_QUEUE_RETRY_AFTER` brings back double analysis. If the backstop SIGKILL does fire, the `docker run --rm` ffmpeg container is not stopped by it. Also, one worker means a long mix's analysis (minutes) holds up every other job while it runs, `realtime` broadcasts included (the dashboard poll covers that gap).
5. **`ROUTER_PORT` is only half configurable.** The vhost is rendered with `ROUTER_PORT`, but compose hardcodes the publish as `127.0.0.1:8091:8091` and the router's `nginx.conf` listens on 8091. Changing `ROUTER_PORT` breaks `/broadcast/{slug}` without any error at setup time.
6. **Icecast capacity ceiling of 50 sources** (`icecast.xml.tpl`), one per running station. Station 51 fails to connect its SOURCE. Icecast also caps 500 clients.
7. **Icecast, the internal vhost (8081) and station telnet (1234) are exposed to all interfaces / the whole Docker network.** Only ufw protects 8000 and 8081, and only if ufw is enabled. Station telnet listens on `0.0.0.0:1234` inside `gocast-network` with no authentication, reachable from every container on the network (station containers, router, proxy).
8. **The ingest port bypasses ufw.** Docker publishes `INGEST_PORT` in its own chain, so it is reachable from the Internet regardless of firewall state; only harbor authentication protects it. Closing it means editing the compose mapping.
9. **Docker socket proxy is not a sandbox** (path/method filtering only; `POST /containers/create` with any body is allowed). Code execution in PHP is close to host root.
10. **Two `api.env.example` files disagree.** `infra/native/env/api.env.example` lacks `LIQUIDSOAP_HLS_BASE_URL` (so HLS is off and the player uses Icecast), lacks `LIQUIDSOAP_CONTAINER_SUBNET` (fine, the default matches), and sets `LIQUIDSOAP_STATION_STORAGE_BYTES` to 100 MB against 3 GiB in `api/.env.example` and the code. Neither lists `BACKUP_S3_BUCKET`.
11. **Stale comment in `config/liquidsoap.php`** says `setup-native.sh` passes `GOCAST_IPAM_RANGE`; the range is declared in the compose file. The same file's comments still reference `infra/setup-host.sh`, `docker-compose.yml` and "all-Docker" defaults that no longer exist. Also stale: `deploy-native.sh` says reconcile "runs every five minutes" and `LiquidsoapSupervisor::verifyStarted()` says the reconciler retries "within five minutes"; the schedule is every minute.
12. **Alloy misses the pool's php-fpm logs.** It tails `/var/log/php8.4-fpm.log` (the master log), but the pool writes application errors to `/var/log/php8.4-fpm-gocast.log` and slow requests to `-gocast-slow.log`, neither of which is collected. It also hardcodes `/srv/gocast/app` and PHP 8.4 instead of `APP_ROOT`/`PHP_VERSION`. Liquidsoap's own Prometheus endpoint is not scraped.
13. **`backup.sh` gaps.** No local copy, no verification, no restore script, cron path in the header does not match the documented checkout, and it misses `api/.env`, `domains.env`, Icecast config and watermark clips. It uses no lock, so two overlapping runs are possible.
14. **`plans:expire` and `app:nudge-inactive-broadcasters` run in the foreground** of `schedule:run` (no `runInBackground()`), unlike the others, so a slow one delays later tasks in that minute.
15. **`infra/mediamtx/mediamtx.yml/` is an empty, root-owned, untracked directory.** `infra/liquidsoap/reference-station.liq`, `infra/liquidsoap/README.md` and `standby.liq` (only the image default CMD) are not part of the running system. The Liquidsoap Dockerfile comment still mentions RTSP pull from MediaMTX.
16. **`api/.dockerignore` is orphaned** (no Dockerfile in `api/`); the `client/next.config.ts` comments still talk about the "Docker image" and "dev (Docker)".
17. **Sanctum `stateful` defaults are localhost-only** and `SANCTUM_STATEFUL_DOMAINS` is not in the native example. Fine while the web app uses bearer tokens; would break cookie-session auth in prod if anything started depending on it.
18. **Node and php versions are hardcoded in places**: `gocast-client.service` requires `/usr/bin/node`; `PHP_VERSION` must match installed packages; Alloy assumes 8.4.
19. **`rollback()` uses `git reset --hard` on the deploy checkout.** Any uncommitted edit on the server is lost on a failed deploy.
20. **No Cloudflare real-IP config in nginx** (no `set_real_ip_from`); client IPs rely on `X-Forwarded-For` and `trustProxies('*')`. Any direct hit to nginx can spoof it.

## Tests

No automated tests cover the scripts, nginx or systemd files. `api/tests/Feature/LiquidsoapSupervisorTest.php` covers the supervisor's command building. `infra/native/verify-ingest.sh <host> <port> <slug>` is a manual four-step probe (OPTIONS, unauthenticated SOURCE expecting 401, authenticated SOURCE expecting 200, libshout-style metadata POST); the stream key comes from `GOCAST_STREAM_KEY` or a prompt, and passing it as an argument is refused. `GOCAST_AUDIO_TEST=1` adds a 20s gstreamer stream.

## History

- `infra/native/README.md`: the runbook (packages, database, TLS, verification, traps, sizing). Treat it as history for anything this doc contradicts.
- [Encoder ingest](encoder-ingest.md) for the router's origin.
- `docs/` plans for the earlier containerised (Caddy/FrankenPHP) stack are obsolete.
