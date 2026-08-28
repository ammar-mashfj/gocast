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
: "${GOCAST_SUBNET:?}" "${DOCKER_HOST_ADDR:?}"

# Renders a template, substituting the __TOKEN__ placeholders. Kept as one
# function so a new placeholder only has to be added in one place.
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
# Created here rather than by compose so the subnet can be pinned: the
# firewall rules below name a stable CIDR instead of a `br-<netid>`
# interface whose name changes whenever the network is recreated.
#
# The labels are what compose stamps on networks it creates itself. They are
# not needed by docker-compose.native.yml, which declares the network
# `external` — but they keep the root docker-compose.yml able to adopt this
# same network if you ever run the containerised stack on this box, instead
# of failing with "network gocast-network was found but has incorrect label
# com.docker.compose.network".
if ! docker network inspect gocast-network >/dev/null 2>&1; then
  docker network create \
    --subnet "$GOCAST_SUBNET" \
    --label com.docker.compose.project=gocast-native \
    --label com.docker.compose.network=default \
    gocast-network
  echo "  ✓ created gocast-network ($GOCAST_SUBNET)"
else
  echo "  · gocast-network exists"
fi

echo "==> Liquidsoap image"
# Pinned to savonet/liquidsoap:v2.4.5 in the Dockerfile. This is the piece
# that cannot move off Docker: Ubuntu ships 2.2.x, which cannot parse the
# generated .liq at all (`on_metadata(synchronous=…)` is 2.4-only), and
# 2.4.0–2.4.2 have the crossfade wedge that makes AutoDJ emit a stuck buzz.
docker build -t gocast/liquidsoap:latest "$REPO_ROOT/infra/liquidsoap/"
echo "  ✓ gocast/liquidsoap:latest"

echo "==> nginx vhosts"
for conf in gocast-api gocast-app gocast-icecast gocast-stream; do
  render "$NATIVE/nginx/${conf}.conf" > "/etc/nginx/sites-available/${conf}.conf"
  ln -sf "/etc/nginx/sites-available/${conf}.conf" "/etc/nginx/sites-enabled/${conf}.conf"
  echo "  ✓ ${conf}.conf"
done
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
for unit in gocast-queue gocast-scheduler gocast-client; do
  render "$NATIVE/systemd/${unit}.service" > "/etc/systemd/system/${unit}.service"
  echo "  ✓ ${unit}.service"
done
systemctl daemon-reload

echo "==> Icecast config"
if [[ -f "$REPO_ROOT/api/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$REPO_ROOT/api/.env"; set +a
fi
if [[ -z "${ICECAST_SOURCE_PASSWORD:-}" ]]; then
  echo "  ! ICECAST_SOURCE_PASSWORD is not set in api/.env — skipping"
  echo "    /etc/icecast2/icecast.xml. Fill the Icecast block in api/.env"
  echo "    (see infra/native/env/api.env.native.example) and re-run."
else
  # Same envsubst call the container entrypoint uses, restricted to exactly
  # these four names so any literal '$' elsewhere in the XML survives.
  render "$NATIVE/icecast/icecast.xml.tpl" \
    | ICECAST_SOURCE_PASSWORD="$ICECAST_SOURCE_PASSWORD" \
      ICECAST_RELAY_PASSWORD="${ICECAST_RELAY_PASSWORD:-$ICECAST_SOURCE_PASSWORD}" \
      ICECAST_ADMIN_USER="${ICECAST_ADMIN_USER:-admin}" \
      ICECAST_ADMIN_PASSWORD="${ICECAST_ADMIN_PASSWORD:?set in api/.env}" \
      envsubst '${ICECAST_SOURCE_PASSWORD} ${ICECAST_RELAY_PASSWORD} ${ICECAST_ADMIN_USER} ${ICECAST_ADMIN_PASSWORD}' \
    > /etc/icecast2/icecast.xml
  chown root:icecast /etc/icecast2/icecast.xml
  chmod 0640 /etc/icecast2/icecast.xml
  # The Debian package ships this flag defaulting to false and refuses to
  # start until it is flipped.
  sed -i 's/^ENABLE=.*/ENABLE=true/' /etc/default/icecast2 2>/dev/null || true
  echo "  ✓ /etc/icecast2/icecast.xml"
fi

echo "==> Firewall"
# Icecast and the internal API vhost both bind all interfaces, because
# `host.docker.internal` resolves to the docker0 gateway (172.17.0.1) and a
# loopback-only listener is invisible to every container. The firewall is
# what keeps them off the public internet.
#
# Two CIDRs because the two bridges are different: containers live on
# gocast-network but reach the host through the docker0 gateway address, so
# packets arrive with a gocast-network source IP on the docker0 address.
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp  >/dev/null
  ufw allow 443/tcp >/dev/null
  for cidr in "$GOCAST_SUBNET" 172.17.0.0/16; do
    ufw allow from "$cidr" to any port "$ICECAST_PORT"      proto tcp >/dev/null
    ufw allow from "$cidr" to any port "$INTERNAL_API_PORT" proto tcp >/dev/null
  done
  echo "  ✓ 80/443 open; ${ICECAST_PORT} and ${INTERNAL_API_PORT} allowed from Docker only"
  echo "    (ufw must be ENABLED for this to mean anything: ufw status)"
else
  echo "  ! ufw not installed. ${ICECAST_PORT} and ${INTERNAL_API_PORT} are"
  echo "    listening on all interfaces — close them before going live."
fi

echo "==> Support containers"
docker compose -f "$NATIVE/docker-compose.native.yml" up -d
echo "  ✓ gocast-docker-proxy, gocast-station-router"

echo ""
echo "✓ Host provisioned."
echo "  Next: nginx -t && systemctl reload nginx"
echo "        certbot --nginx -d $APP_HOST -d $API_HOST -d $ICECAST_HOST -d $STREAM_HOST"
echo "        bash infra/native/deploy-native.sh"
