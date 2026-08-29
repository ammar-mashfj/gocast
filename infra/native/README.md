# Deploying GoCast

This is **the** runbook. GoCast runs on a box where nginx, PHP, MySQL, Redis
and Icecast are host packages. Docker is installed for one reason: one
Liquidsoap container per on-air station.

Everything in this directory is rendered and installed by
`setup-native.sh`; you should not need to hand-edit anything except
`env/domains.env` and `api/.env`.

---

## What runs where

| Piece | How it runs |
|---|---|
| Web server + PHP | nginx + php-fpm |
| MySQL, Redis, Icecast | apt packages, on loopback |
| Queue worker | `gocast-queue.service` |
| Scheduler | `gocast-scheduler.service` |
| Next.js client | `gocast-client.service` |
| TLS | `certbot --nginx` |
| Docker API guard | `docker-proxy` container (see below) |
| Station routing | `station-router` container (see below) |
| Per-station playout | one `docker run` per on-air station |

So: **two long-lived containers, plus one per on-air station.** Nothing else
is containerised. If you find yourself reaching for a `docker-compose.yml` at
the repo root, it was deleted deliberately — the whole application stack used
to live there and every service in it is now a host service.

### Why Docker is installed at all

Two things need it, and only two.

**1. Per-station Liquidsoap.** `infra/liquidsoap/Dockerfile` pins
`savonet/liquidsoap:v2.4.5` and the comment above the `FROM` explains why:
2.4.0–2.4.2 shipped a crossfade bug (savonet#4851) that wedged AutoDJ into
emitting one buffered frame forever — listeners hear a stuck buzz, nothing
is logged — and 2.4.5 also carries the fix for a crash when `source.skip` is
called from a `harbor.http` handler (savonet#5194), which this app does
every couple of seconds when Laravel polls `/status`.

Ubuntu 24.04 ships Liquidsoap 2.2.x. It cannot parse the generated `.liq` at
all — `on_metadata(synchronous=…)` is 2.4-only. So the host package is not
an option, and `LiquidsoapSupervisor` is ~1200 lines built around
`docker run/stop/rm/inspect/ps/logs` with per-container health checks,
restart policy, resource caps, log rotation and capability dropping. Keeping
it is a five-minute `apt install docker-ce`; replacing it is a rewrite.

**2. The station router.** More on this below.

Docker runs exactly two long-lived containers of its own
(`docker-compose.native.yml`), plus one container per on-air station.

**On the socket proxy, honestly.** It keeps the `gocast` user off
`/var/run/docker.sock`, so a file-read or file-write bug cannot reach the
daemon. It does *not* contain code execution: it filters by API path and
method and never inspects the request body, and this app needs `CONTAINERS`
+ `POST`, i.e. `/containers/create` with an arbitrary `HostConfig` — where
bind mounts and `Privileged` live. Treat PHP RCE on this host as root. The
fix, if you want one, is an argv-validating sudo wrapper in place of the
proxy, not a different proxy setting.

### The station-router container

Broadcaster ingest has to reach `gocast-liquidsoap-{slug}:8090`, and **host
nginx cannot resolve that name.** Docker's embedded DNS at `127.0.0.11` is
only reachable from inside a container, and a station's bridge IP changes on
every restart, so there is nothing stable to put in a config file.

`station-router/nginx.conf` is a ~20-line nginx container that sits on
`gocast-network`, resolves the container name per request through
`127.0.0.11`, and is published on `127.0.0.1:8091`. Host nginx forwards
`/broadcast/{slug}` there and the router does the rest. Nothing needs
regenerating when stations come and go.

The alternatives all cost more. Publishing a host port per station, or
pinning a container IP per station, means a code change plus a generated
nginx `map` plus a reload whenever the set of stations changes — and a new
failure mode where the map drifts and a live station 404s. Resolving at
request time cannot drift. The router costs 8 MB.

(Laravel has the same problem and solves it differently: it runs on the host
too, so `LIQUIDSOAP_TELNET_RESOLVE=ip` makes it look each address up with
`docker inspect`. That is fine for a poll and wrong for a proxy.)

---

## Sizing

Per-station Liquidsoap is ~50 MB idle, ~100 MB encoding, capped at `512m`
(`LIQUIDSOAP_CONTAINER_MEMORY`). On top of that, budget roughly: php-fpm
12 children × up to 256 MB peak, Next.js ~150 MB, MySQL ~400 MB, Redis
single-digit MB, Icecast ~2 MB plus a buffer per listener.

- Under 50 concurrent listeners, under 5 stations: 2 vCPU / 4 GB / 80 GB.
- Under 500 listeners, under 50 stations: 4 vCPU / 8 GB / 160 GB.

Storage is the one that bites: uploaded tracks live on local disk
(`/var/gocast/playlists`), capped per station by
`LIQUIDSOAP_STATION_STORAGE_BYTES` (100 MB default).

---

## DNS

Four A records, all pointing at the VPS:

| Hostname | Serves |
|---|---|
| `gocast.fm` | Next.js app |
| `api.gocast.fm` | Laravel API |
| `icecast.gocast.fm` | listener audio |
| `stream.gocast.fm` | broadcaster WebSocket + HLS |

> Older docs said `stream.` had to be grey-cloud (DNS-only) in Cloudflare
> because WebRTC needed direct UDP. That is gone: MediaMTX and WHIP were
> removed, ingest is a Liquidsoap harbor WebSocket over 443, so there is no
> UDP media path and Cloudflare's proxy is fine in front of all four.

---

## 1. Packages

```bash
sudo apt update && sudo apt install -y \
  nginx mysql-server mysql-client redis-server icecast2 \
  php8.4-fpm php8.4-cli php8.4-mysql php8.4-redis php8.4-bcmath \
  php8.4-gd php8.4-zip php8.4-intl php8.4-mbstring php8.4-xml php8.4-curl \
  certbot python3-certbot-nginx git unzip ufw
```

Laravel needs `pdo_mysql redis bcmath gd zip intl mbstring opcache`;
`opcache` is built into the Debian `php8.4-cli`/`fpm` packages. Verify
nothing is missing:

```bash
cd api && composer check-platform-reqs
```

Composer and Node:

```bash
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Docker (for Liquidsoap only):

```bash
curl -fsSL https://get.docker.com | sudo sh
```

> Do **not** add the php-fpm user to the `docker` group. That hands any PHP
> file-read or file-write bug the daemon socket, which is root on the host.
> The socket proxy in `docker-compose.native.yml` is what keeps the `gocast`
> user off it. Read the caveat above about what the proxy does *not* stop.

## 2. Database

```bash
sudo mysql_secure_installation
sudo mysql -e "CREATE DATABASE gocast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
               CREATE USER 'gocast'@'127.0.0.1' IDENTIFIED BY 'CHANGEME';
               GRANT ALL ON gocast.* TO 'gocast'@'127.0.0.1';"
```

Leave MySQL bound to `127.0.0.1` (the Ubuntu default). Nothing in a
container talks to it — only Laravel does, and Laravel is on the host now.

## 3. Checkout

```bash
sudo mkdir -p /srv/gocast
sudo git clone <your-remote> /srv/gocast/app
```

Ownership is fixed in step 5, after the service user exists.

## 4. Configuration

```bash
cd /srv/gocast/app
cp infra/native/env/domains.env.example infra/native/env/domains.env
$EDITOR infra/native/env/domains.env          # your four hostnames

cp api/.env.example api/.env
sed -i 's/gocast\.fm/YOURDOMAIN.com/g' api/.env
$EDITOR api/.env                               # fill the five FILL ME values
php api/artisan key:generate
```

`api/.env.example` is a complete, commented file for exactly this deployment
— not a patch to merge. The defaults in `config/liquidsoap.php` already match
it, so an unset key is correct rather than dangerous. Three still deserve a
second look, because a wrong value fails silently:

- **`LIQUIDSOAP_TELNET_RESOLVE`.** Must stay `ip`. Docker's embedded DNS does
  not exist for a host process, so Laravel cannot resolve
  `gocast-liquidsoap-{slug}` to poll a station's `/status`. Set to `name`,
  stations start fine and then sit in `starting` forever because every status
  poll times out.
- **`ICECAST_SOURCE_PASSWORD` and `INTERNAL_API_KEY`.** Both are blank in the
  example and there is no other source for them. An empty source password
  renders `password = null` into every `.liq` and every station crashes on
  start; a wrong internal key means broadcasters cannot go live and the
  studio does not say why.
- **`LIQUIDSOAP_INGEST_URL`.** Empty means Laravel hands the studio a raw
  `ws://<container-ip>:8090/{slug}` — plain text, and unreachable from
  anywhere but this host.

`setup-native.sh` reads `api/.env` to render `/etc/icecast2/icecast.xml`, so
fill the Icecast block *before* running it.

## 5. Provision the host

```bash
sudo bash infra/native/setup-native.sh
sudo chown -R gocast:gocast /srv/gocast/app
```

That creates the `gocast` user, `/var/gocast/{liq,playlists,hls,system}`
owned `gocast:101` mode 0775, `gocast-network` on a pinned subnet, builds
`gocast/liquidsoap:latest`, renders and installs the four nginx vhosts, the
php-fpm pool and ini, the three systemd units and `/etc/icecast2/icecast.xml`,
opens the firewall, and starts the two support containers.

> GID 101 is the `liquidsoap` group *inside* the container image. Liquidsoap
> runs as uid 100 / gid 101 and must write the `hls/{slug}` directories that
> are bind-mounted out of `/var/gocast`.

## 6. TLS

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gocast.fm -d api.gocast.fm \
                     -d icecast.gocast.fm -d stream.gocast.fm
```

Certbot rewrites the vhosts in place to add the `:443` blocks and the
http→https redirects. Re-running `setup-native.sh` **overwrites those
edits** — run certbot again afterwards; it is idempotent and will reuse the
existing certificate.

## 7. Deploy

```bash
sudo systemctl enable --now redis-server icecast2 php8.4-fpm
sudo bash infra/native/deploy-native.sh
sudo systemctl enable --now gocast-queue gocast-scheduler gocast-client
```

`deploy-native.sh` is the steady-state command from here on: dump the DB,
pull, install deps, build the client, migrate, cache, reload php-fpm,
restart the workers, then relaunch and reconcile station containers.

---

## Verification

Work down this list. Each step fails in a distinct way, which is what makes
it worth doing in order.

```bash
# 1. PHP is serving, DB is reachable
curl -fsS https://api.gocast.fm/up

# 2. The internal vhost answers, and ONLY from the box
curl -fsS http://127.0.0.1:8081/up
curl -fsS http://<public-ip>:8081/up          # must time out

# 3. Icecast is up and not public
curl -fsS http://127.0.0.1:8000/status-json.xsl
curl -fsS http://<public-ip>:8000/            # must time out

# 4. Workers are alive
systemctl status gocast-queue gocast-scheduler gocast-client

# 5. Docker access works through the proxy, not the raw socket
sudo -u gocast DOCKER_HOST=tcp://127.0.0.1:2375 docker ps

# 6. Start a station from the UI, then:
docker ps --filter name=gocast-liquidsoap-
docker logs gocast-liquidsoap-<slug> --tail 50
curl -fsS https://icecast.gocast.fm/stream/<slug> -r 0-1024 -o /dev/null

# 7. Go live from the studio, and watch the router
docker logs gocast-station-router --tail 20
```

---

## Traps

**`host.docker.internal` is 172.17.0.1, not 127.0.0.1.** `--add-host
host-gateway` maps to the *default* bridge gateway even for containers on
`gocast-network`. Anything a station container calls back to — Icecast on
`:8000`, the internal API vhost on `:8081` — must bind all interfaces, not
loopback. That is why the firewall rules matter: they are the only thing
keeping those two ports off the public internet. `ufw status` should show
them allowed from the Docker CIDRs and nowhere else.

**`storage:link` must be `--relative`.** `api/public/storage` may already be
an absolute symlink to `/app/storage/app/public` — a path from the old
containerised layout. On the host that target does not exist and every
artwork URL 404s while the files are plainly there.

**`NEXT_PUBLIC_*` are build-time.** They are inlined into the browser bundle
by `next build`. Setting them in `gocast-client.service` does nothing; a
wrong API URL can only be fixed by rebuilding.

**The standalone bundle needs `public/` and `.next/static` copied in.**
`next build` does not do it. `deploy-native.sh` does. Skip that step and the
site renders unstyled.

**`opcache.validate_timestamps` must be `1`.** `0` is correct for an
immutable image and wrong here: a deploy rewrites files under a running
php-fpm, so with validation off `git pull` changes nothing until a reload —
and a half-reloaded box serves old code against a new schema. `99-gocast.ini`
sets `1` with a 2s revalidation.

**One scheduler, always.** `withoutOverlapping` locks are per-process unless
a shared cache store backs them, so a second `schedule:work` double-fires
every job — including `stations:reconcile`, which would race itself tearing
station containers down.

**`DOCKER_HOST` has to be a real environment variable, not just an `.env`
line.** `deploy-native.sh` runs `config:cache`, and Laravel skips loading
`.env` entirely when the config is cached — `LoadEnvironmentVariables`
returns early — so the `putenv()` that would export it never happens. php-fpm
compounds it by defaulting to `clear_env = yes`, which hands workers an empty
environment with no `PATH` either. The `docker` CLI then falls back to
`/var/run/docker.sock`, which the `gocast` user deliberately cannot read, and
every station start fails on a permission error.

So it is set in three places — `env[]` in the php-fpm pool, `Environment=` in
the queue and scheduler units, and explicitly across the `sudo` boundary in
`deploy-native.sh`. Keep the `api/.env` line too; it is what a bare
`php artisan` uses once the config cache is cleared.

**`open_basedir` is set on the pool.** If something 500s with "open_basedir
restriction in effect", widen the list in `php/gocast.pool.conf` rather than
removing it.

---

## Known gap: the `/broadcast/{slug}` path

`input.harbor(slug, port=8090)` registers its mount at **`/{slug}`**. The
public ingest URL is `/broadcast/{slug}`, so the prefix has to be dropped
before the request reaches harbor. `station-router/nginx.conf` does that —
putting `/$slug` after the upstream in `proxy_pass` replaces the request URI
outright.

The router is now the only implementation of this route. The Caddy vhost that
used to do it was deleted with the containerised stack, and it got this
*wrong* (`handle` preserves the matched path; only `handle_path` strips it),
which is one reason not to mourn it.

**Verified in isolation** (nginx 1.29-alpine, throwaway network, stub backend
named `gocast-liquidsoap-testslug`):

| Request to the router | Result |
|---|---|
| `/broadcast/testslug` | backend saw `/testslug`; `Upgrade: websocket` and `Sec-WebSocket-Protocol: webcast` both survived the hop |
| `/broadcast/nosuchstation` | `502` — name does not resolve, which is the correct answer for a station that is not running |
| `/broadcast/evil.host` | `404` — the dot is outside the slug charset, so it never reached the proxy at all |

**Still unverified against real harbor.** A stub backend proves the router
rewrites and upgrades correctly; it does not prove Liquidsoap's harbor
accepts the result. Do this before launch: start a station, go live from the
studio, and watch `docker logs gocast-station-router`. It is the one step in
this runbook nothing else covers.

---

## Local development

Same shape as production, which is the point — there is no separate
development stack any more. On a laptop:

```bash
sudo apt install -y redis-server icecast2 docker.io
```

Then run the app processes directly, and only the audio in Docker:

```bash
docker compose -f infra/native/docker-compose.native.yml up -d   # network + proxy + router
cd api    && php artisan serve                                   # :8000
cd client && npm run dev                                         # :3000
cd api    && php artisan queue:work
```

`api/.env` for a laptop differs from the server in three ways:

- `APP_ENV=local`, `APP_DEBUG=true`
- `LIQUIDSOAP_INGEST_URL=` — **empty**. Laravel then hands the studio a raw
  `ws://<container-ip>:8090/{slug}`, which works because Linux routes to
  Docker bridge IPs from the host, so no nginx and no TLS is needed. This is
  the one place development legitimately diverges.
- `ICECAST_INTERNAL_URL=http://127.0.0.1:8000` and
  `LIQUIDSOAP_ICECAST_PORT=8000` — matching whatever your host Icecast uses.

Note that host Redis binds `127.0.0.1:6379` and is enabled at boot on Ubuntu,
which is exactly what the app expects.

---

## Observability (optional)

Grafana Alloy ships a `.deb` — install it as a host service rather than a
container:

```bash
sudo apt install -y alloy        # after adding Grafana's apt repo
```

`infra/alloy/config.alloy` is written for it. It keeps one Docker block, for
per-station container logs, and reads everything else off the filesystem:
nginx, php-fpm, and the systemd journal. The six `GRAFANA_CLOUD_*` values go
in `/etc/default/alloy`.
