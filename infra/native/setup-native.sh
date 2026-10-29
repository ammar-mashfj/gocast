#!/usr/bin/env bash
# One-time (and re-runnable) host provisioning for a NATIVE GoCast deploy:
# nginx + php-fpm + MySQL as host packages, Docker present only to run the
# per-station Liquidsoap containers.
#
# Idempotent. Run it again after changing infra/native/env/domains.env to
# re-render every config from the templates.
#
#   sudo bash infra/native/setup-native.sh
#
# What it does NOT do — deliberately, because each one wants a human:
#   • install packages (the versions are yours to choose)
#   • create the MySQL database or user
#   • write api/.env
#   • request TLS certificates
# The README walks through those in order.

set -euo pipefail

cd "$(dirname "$0")/../.."
REPO_ROOT="$(pwd)"
NATIVE="$REPO_ROOT/infra/native"

if [[ $EUID -ne 0 ]]; then
  echo "!! Run with sudo — this writes to /etc, /var and /srv." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DOMAINS="$NATIVE/env/domains.env"
if [[ ! -f "$DOMAINS" ]]; then
  echo "!! $DOMAINS not found."
  echo "   cp infra/native/env/domains.env.example infra/native/env/domains.env"
  echo "   then edit it and re-run."
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$DOMAINS"; set +a

: "${APP_HOST:?}" "${API_HOST:?}" "${ICECAST_HOST:?}" "${STREAM_HOST:?}"
: "${APP_ROOT:?}" "${RUN_USER:?}" "${PHP_VERSION:?}"
: "${CLIENT_PORT:?}" "${ICECAST_PORT:?}" "${ROUTER_PORT:?}" "${INTERNAL_API_PORT:?}"
: "${INGEST_PORT:?}"
: "${DOCKER_HOST_ADDR:?}"

# INGEST_PORT is published on all interfaces by docker-compose.native.yml while
# every other port in domains.env is a host listener or a loopback publish, so a
# collision is not a config smell — it is a container that will not start, and
# the symptom is every encoder in the world getting "connection refused" while
# `docker ps` looks fine.
#
# ROUTER_PORT is in this list for the reason that is easiest to miss: it is
# published by the SAME container. A collision there is not a degraded encoder
# path, it is the station router failing to start at all — which takes
# /broadcast/{slug} with it and stops the browser studio too.
#
# Fatal rather than a warning on purpose. The whole failure mode this feature
# was built around is a broadcast that appears to work and carries nothing;
# a setup step that half-succeeds is the same shape of problem.
for _other in ICECAST_PORT ROUTER_PORT CLIENT_PORT INTERNAL_API_PORT; do
  if [[ "$INGEST_PORT" == "${!_other}" ]]; then
    echo "!! INGEST_PORT and ${_other} are both ${INGEST_PORT}." >&2
    echo "   The ingest router publishes its port from a container, and" >&2
    echo "   ${_other} already has that number on this box; they cannot" >&2
    echo "   share one. Change either in infra/native/env/domains.env" >&2
    echo "   and re-run." >&2
    exit 1
  fi
done
unset _other

# Renders a template, substituting the __TOKEN__ placeholders. Kept as one
# function so a new placeholder only has to be added in one place.
#
# INGEST_PORT is deliberately NOT here. Every other port in this list reaches a
# host nginx vhost, a php-fpm pool or icecast.xml; the ingest port reaches none
# of them, because Docker publishes it directly and nothing on the host proxies
# it. It goes to docker-compose.native.yml through the environment instead. A
# substitution with no template to land in looks like a rendered config that
# exists somewhere, and there is none.
render() {
  sed -e "s|__APP_HOST__|${APP_HOST}|g" \
      -e "s|__API_HOST__|${API_HOST}|g" \
      -e "s|__ICECAST_HOST__|${ICECAST_HOST}|g" \
      -e "s|__STREAM_HOST__|${STREAM_HOST}|g" \
      -e "s|__APP_ROOT__|${APP_ROOT}|g" \
      -e "s|__RUN_USER__|${RUN_USER}|g" \
      -e "s|__PHP_VERSION__|${PHP_VERSION}|g" \
      -e "s|__CLIENT_PORT__|${CLIENT_PORT}|g" \
      -e "s|__ICECAST_PORT__|${ICECAST_PORT}|g" \
      -e "s|__ROUTER_PORT__|${ROUTER_PORT}|g" \
      -e "s|__INTERNAL_API_PORT__|${INTERNAL_API_PORT}|g" \
      -e "s|__DOCKER_HOST__|${DOCKER_HOST_ADDR}|g" \
      "$1"
}

echo "==> Service user"
# --system: no password, no aging, low uid. A shell is required (not
# nologin) because deploy-native.sh runs composer and artisan as this user
# via `sudo -u`, and sudo needs a usable shell to do that.
if ! id -u "$RUN_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/srv/${RUN_USER}" \
          --shell /bin/bash "$RUN_USER"
  echo "  ✓ created $RUN_USER"
else
  echo "  · $RUN_USER exists"
fi
# `adm` reads /var/log/nginx: security:scan-access-logs (scheduler) alerts on
# 4xx storms and direct-to-origin attempts from those logs.
usermod -aG adm "$RUN_USER"
echo "  ✓ $RUN_USER in adm (nginx logs)"

echo "==> Per-station data directories"
# GID 101 is the `liquidsoap` group inside savonet/liquidsoap. It is the one
# constant across every deployment shape: Liquidsoap runs as uid 100 / gid
# 101 inside its container and must WRITE the hls/{slug} directories that
# are bind-mounted from here.
#
# The OWNER is the Laravel user, because natively that is who creates the
# .liq files and playlist directories. Mode 0775 gives gid 101 write access
# without resorting to 0777 on the tree.
#
# (LiquidsoapSupervisor::ensureDirectories additionally chmods each
# per-station playlists/ and hls/ subdirectory to 0777 as it creates them,
# which is what actually guarantees the container can write regardless of
# the creating process's umask. Nothing here needs to duplicate that.)
install -d -o "$RUN_USER" -g 101 -m 0775 \
  /var/gocast /var/gocast/liq /var/gocast/playlists /var/gocast/hls /var/gocast/system
echo "  ✓ /var/gocast/{liq,playlists,hls,system}"

echo "==> Docker network"
# Declared in docker-compose.native.yml (pinned subnet + ip_range) and
# created by the `up` further down, not here. Nothing between this point and
# there needs it to exist — the ufw rules now run after that `up` and read
# the block back off the live network.
#
# The one case compose cannot handle is a network that already exists with
# the wrong IPAM — it adopts such a network silently, because Docker cannot
# change a network's addressing in place. Say so here rather than leave the
# collision to surface months later as one station that will not start.
if docker network inspect gocast-network >/dev/null 2>&1 \
   && ! docker network inspect gocast-network \
        --format '{{range .IPAM.Config}}{{.IPRange}}{{end}}' 2>/dev/null | grep -q .; then
  echo "  ! gocast-network exists WITHOUT an ip_range."
  echo "    IPAM will allocate from the bottom of the subnet, where per-station"
  echo "    addresses live. Recreate it with every station stopped:"
  echo "      docker compose -f $NATIVE/docker-compose.native.yml down"
  echo "      docker rm -f \$(docker ps -aq --filter name=gocast-liquidsoap-)"
  echo "      docker network rm gocast-network && sudo bash $0"
else
  echo "  · declared in docker-compose.native.yml; created below"
fi

echo "==> Liquidsoap image"
# Pinned to savonet/liquidsoap:v2.4.5 in the Dockerfile. This is the piece
# that cannot move off Docker: Ubuntu ships 2.2.x, which cannot parse the
# generated .liq at all (`on_metadata(synchronous=…)` is 2.4-only), and
# 2.4.0–2.4.2 have the crossfade wedge that makes AutoDJ emit a stuck buzz.
docker build -t gocast/liquidsoap:latest "$REPO_ROOT/infra/liquidsoap/"
echo "  ✓ gocast/liquidsoap:latest"

echo "==> nginx vhosts"
# gocast-default is the catch-all for unknown hostnames (444 / refused TLS).
for conf in gocast-api gocast-app gocast-icecast gocast-stream gocast-default; do
  render "$NATIVE/nginx/${conf}.conf" > "/etc/nginx/sites-available/${conf}.conf"
  ln -sf "/etc/nginx/sites-available/${conf}.conf" "/etc/nginx/sites-enabled/${conf}.conf"
  echo "  ✓ ${conf}.conf"
done
# http-level, not a vhost: real client IPs behind Cloudflare for every server.
install -m 644 "$NATIVE/nginx/cloudflare-realip.conf" /etc/nginx/conf.d/cloudflare-realip.conf
echo "  ✓ conf.d/cloudflare-realip.conf"
# Ubuntu's stock default vhost is `default_server` on :80, which means it
# answers any Host header that does not match ours — including the ACME
# challenge for a hostname whose vhost has a typo. Removing it turns that
# class of mistake into an obvious 404 instead of a silent wrong answer.
rm -f /etc/nginx/sites-enabled/default

echo "==> php-fpm"
render "$NATIVE/php/gocast.pool.conf" > "/etc/php/${PHP_VERSION}/fpm/pool.d/gocast.conf"
# The ini goes into BOTH SAPIs: the queue worker (CLI) processes the same
# uploads the web tier (FPM) accepted, so a smaller CLI memory_limit fails
# jobs that already succeeded over HTTP.
for sapi in fpm cli; do
  render "$NATIVE/php/99-gocast.ini" > "/etc/php/${PHP_VERSION}/${sapi}/conf.d/99-gocast.ini"
done
echo "  ✓ pool + ini for php${PHP_VERSION} (fpm, cli)"

echo "==> systemd units"
# gocast-relay@ is a template: instances gocast-relay@8095 and @8096, enabled
# in the Relay step below.
for unit in gocast-queue gocast-realtime gocast-analysis gocast-scheduler gocast-client \
            gocast-relay@ gocast-standby; do
  render "$NATIVE/systemd/${unit}.service" > "/etc/systemd/system/${unit}.service"
  echo "  ✓ ${unit}.service"
done
# Every Free listener now plays Icecast directly, and every relay studio holds
# a source there: the package default of 1024 open files is far too few.
mkdir -p /etc/systemd/system/icecast2.service.d
printf '[Service]\nLimitNOFILE=65536\n' > /etc/systemd/system/icecast2.service.d/gocast-limits.conf
echo "  ✓ icecast2 LimitNOFILE=65536"
systemctl daemon-reload

echo "==> Icecast config"
if [[ -f "$REPO_ROOT/api/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$REPO_ROOT/api/.env"; set +a

  # api/.env sets DOCKER_HOST=tcp://127.0.0.1:2375 for the APP, which reaches
  # the daemon through gocast-docker-proxy. Sourcing it here would export that
  # into this script too — and the `docker compose up` below is what STARTS
  # that proxy, so it would be asked to reach the proxy in order to create it:
  #
  #   Cannot connect to the Docker daemon at tcp://127.0.0.1:2375
  #
  # taking the firewall block after it down with it, on every run. This script
  # is root on the host and should always talk to the unix socket directly.
  unset DOCKER_HOST
fi
if [[ -z "${ICECAST_SOURCE_PASSWORD:-}" ]]; then
  echo "  ! ICECAST_SOURCE_PASSWORD is not set in api/.env — skipping"
  echo "    /etc/icecast2/icecast.xml. Fill the Icecast block in api/.env"
  echo "    (see api/.env.example) and re-run."
else
  # Same envsubst call the container entrypoint uses, restricted to exactly
  # these names so any literal '$' elsewhere in the XML survives.
  # ICECAST_CALLBACK_*: the Basic credential Icecast sends to Laravel for
  # relay logins and source events (config/relay.php). Unset, Pro is
  # unaffected but every relay login is refused — the relay is effectively
  # off, whatever RELAY_ENABLED says.
  if [[ -z "${ICECAST_CALLBACK_PASSWORD:-}" ]]; then
    echo "  ! ICECAST_CALLBACK_PASSWORD is not set in api/.env — Free stations on the"
    echo "    relay will be refused until it is (Pro is unaffected)."
  fi
  render "$NATIVE/icecast/icecast.xml.tpl" \
    | ICECAST_SOURCE_PASSWORD="$ICECAST_SOURCE_PASSWORD" \
      ICECAST_ADMIN_USER="${ICECAST_ADMIN_USER:-admin}" \
      ICECAST_ADMIN_PASSWORD="${ICECAST_ADMIN_PASSWORD:?set in api/.env}" \
      ICECAST_MAX_SOURCES="${ICECAST_MAX_SOURCES:-150}" \
      ICECAST_MAX_CLIENTS="${ICECAST_MAX_CLIENTS:-5000}" \
      ICECAST_CALLBACK_USER="${ICECAST_CALLBACK_USER:-icecast}" \
      ICECAST_CALLBACK_PASSWORD="${ICECAST_CALLBACK_PASSWORD:-}" \
      envsubst '${ICECAST_SOURCE_PASSWORD} ${ICECAST_ADMIN_USER} ${ICECAST_ADMIN_PASSWORD} ${ICECAST_MAX_SOURCES} ${ICECAST_MAX_CLIENTS} ${ICECAST_CALLBACK_USER} ${ICECAST_CALLBACK_PASSWORD}' \
    > /etc/icecast2/icecast.xml
  chown root:icecast /etc/icecast2/icecast.xml
  chmod 0640 /etc/icecast2/icecast.xml
  # The Debian package ships this flag defaulting to false and refuses to
  # start until it is flipped.
  sed -i 's/^ENABLE=.*/ENABLE=true/' /etc/default/icecast2 2>/dev/null || true
  echo "  ✓ /etc/icecast2/icecast.xml"

  # The standby feeder's only secret, kept out of its command line (`ps`).
  install -d -m 0750 -o root -g "$RUN_USER" /etc/gocast
  printf 'ICECAST_SOURCE_PASSWORD=%s\n' "$ICECAST_SOURCE_PASSWORD" > /etc/gocast/standby.env
  chown root:"$RUN_USER" /etc/gocast/standby.env
  chmod 0640 /etc/gocast/standby.env
  echo "  ✓ /etc/gocast/standby.env"
fi

echo "==> Support containers"
# --build because the station router is now an image of ours rather than stock
# nginx: it carries the njs module the ingest routing needs, and the module is
# pinned to an exact nginx version. Without this the first run after a module
# bump silently keeps the old image.
#
# INGEST_PORT reaches compose through the environment — domains.env was sourced
# with `set -a` above, so the interpolation in docker-compose.native.yml picks
# it up without an --env-file.
docker compose -f "$NATIVE/docker-compose.native.yml" up -d --build
echo "  ✓ gocast-network, gocast-docker-proxy, gocast-station-router"
echo "    encoder ingest published on 0.0.0.0:${INGEST_PORT}"

echo "==> Firewall"
# Icecast and the internal API vhost both bind all interfaces, because
# `host.docker.internal` resolves to the docker0 gateway (172.17.0.1) and a
# loopback-only listener is invisible to every container. The firewall is
# what keeps them off the public internet.
#
# Two CIDRs because the two bridges are different: containers live on
# gocast-network but reach the host through the docker0 gateway address, so
# packets arrive with a gocast-network source IP on the docker0 address.
#
# The gocast-network block is read back off the network that compose just
# created rather than restated in domains.env. That is why this step runs
# here and not before the `up`: a rule naming a CIDR the network does not
# actually use is indistinguishable from a working firewall until a station
# cannot reach Icecast.
GOCAST_SUBNET="$(docker network inspect gocast-network \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')"
: "${GOCAST_SUBNET:?could not read the gocast-network subnet}"

if command -v ufw >/dev/null 2>&1; then
  # Once ufw-cloudflare-only.sh has narrowed 80/443 to Cloudflare, re-running
  # setup must not quietly open them to everyone again.
  if ufw status | grep -q '# cloudflare'; then
    echo "  · 80/443 are Cloudflare-only (ufw-cloudflare-only.sh); left as they are"
  else
    ufw allow 80/tcp  >/dev/null
    ufw allow 443/tcp >/dev/null
  fi
  for cidr in "$GOCAST_SUBNET" 172.17.0.0/16; do
    ufw allow from "$cidr" to any port "$ICECAST_PORT"      proto tcp >/dev/null
    ufw allow from "$cidr" to any port "$INTERNAL_API_PORT" proto tcp >/dev/null
  done
  echo "  ✓ 80/443 open; ${ICECAST_PORT} and ${INTERNAL_API_PORT} allowed from Docker only"
  echo "    (ufw must be ENABLED for this to mean anything: ufw status)"
  # Deliberately NOT `ufw allow ${INGEST_PORT}`. Docker publishes that port by
  # writing to the DOCKER chain, which sits in front of the INPUT chain ufw
  # manages — so the port is already reachable from the internet and a ufw rule
  # for it would be a comforting no-op. It is open because we chose to publish
  # it; closing it means removing the mapping in docker-compose.native.yml.
  # Harbor authenticates every connection that arrives on it.
  echo "  ! ${INGEST_PORT} (encoder ingest) is published by Docker IN FRONT OF ufw"
  echo "    and is reachable from the internet regardless of ufw status."
else
  echo "  ! ufw not installed. ${ICECAST_PORT} and ${INTERNAL_API_PORT} are"
  echo "    listening on all interfaces — close them before going live."
fi


echo "==> Relay"
# Enabled here; built and (re)started by deploy-native.sh, which owns the
# binary. Started now only if a deploy has already built it.
systemctl enable gocast-relay@8095 gocast-relay@8096 gocast-standby >/dev/null 2>&1
if [[ -x "$REPO_ROOT/relay/bin/gocast-relay" ]]; then
  systemctl restart gocast-relay@8095; sleep 3; systemctl restart gocast-relay@8096
  systemctl restart gocast-standby
  echo "  ✓ gocast-relay@8095, gocast-relay@8096, gocast-standby running"
else
  echo "  · enabled; the next deploy builds and starts them"
fi

# nginx holds two sockets per relay studio and two per Icecast listener. The
# Ubuntu default (768 connections per worker, 1024 open files) caps the relay
# lab at about 1,000 studios. worker_rlimit_nofile is a main-context
# directive; modules-enabled/ is the include Ubuntu's nginx.conf reads there.
printf 'worker_rlimit_nofile 65536;\n' > /etc/nginx/modules-enabled/90-gocast-limits.conf
if grep -Eq '^\s*worker_connections\s+[0-9]+;' /etc/nginx/nginx.conf; then
  current="$(grep -Eo '^\s*worker_connections\s+[0-9]+' /etc/nginx/nginx.conf | grep -Eo '[0-9]+$')"
  if (( current < 8192 )); then
    sed -Ei 's/^(\s*worker_connections\s+)[0-9]+;/\18192;/' /etc/nginx/nginx.conf
    echo "  ✓ nginx worker_connections ${current} → 8192, worker_rlimit_nofile 65536"
  else
    echo "  · nginx worker_connections already ${current}; worker_rlimit_nofile 65536"
  fi
fi

echo ""
echo "✓ Host provisioned."
echo "  Next: nginx -t && systemctl reload nginx"
echo "        certbot --nginx -d $APP_HOST -d $API_HOST -d $ICECAST_HOST -d $STREAM_HOST"
echo "        bash infra/native/deploy-native.sh"
