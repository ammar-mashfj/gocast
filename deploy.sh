#!/usr/bin/env bash
# Production deploy. One command: pull, build, migrate, swap.
#
# Usage:
#   ./deploy.sh
#
# Requires:
#   - .env at the repo root (copy from .env.docker.example)
#   - MySQL running on the host with the `gocast` database created and the
#     gocast user granted access. See docker-compose.yml header for the
#     one-time setup commands.
#
# What this does NOT do:
#   - Configure the host (firewall, MySQL install, TLS DNS records)
#
# Per-station Liquidsoap containers are managed by the app itself
# (App\Services\LiquidsoapSupervisor, driven off StationObserver). The
# relaunch + reconcile steps below just bring that set back in line after a
# deploy; there are no systemd units involved.

set -euo pipefail

cd "$(dirname "$0")"

# Skip the dev override file in prod. The base docker-compose.yml is
# self-contained for production deploys.
export COMPOSE_FILE=docker-compose.yml

echo "==> Pulling latest source"
git pull --ff-only

echo "==> Provisioning host directories + Liquidsoap image"
# Idempotent: creates /var/gocast/{liq,playlists,hls}, ensures the
# gocast-network exists, and (re)builds gocast/liquidsoap:latest so the
# `stations:relaunch` step below can spawn per-station containers without
# tripping on a missing image.
bash infra/setup-host.sh

echo "==> Building images"
docker compose build

echo "==> Starting services"
docker compose up -d --remove-orphans

echo "==> Running migrations (idempotent)"
docker compose exec -T api php artisan migrate --force

echo "==> Caching config + routes"
docker compose exec -T api php artisan config:cache
docker compose exec -T api php artisan route:cache
docker compose exec -T api php artisan event:cache

echo "==> Ensuring every station's Liquidsoap container is running"
# Idempotent — restarts already-running containers (~3s each), brings up
# stations that pre-date the per-station Liquidsoap rollout, recovers from
# any container that died since last deploy.
docker compose exec -T api php artisan stations:relaunch

echo "==> Reconciling Liquidsoap containers against the station table"
# Removes per-station containers whose Station row is gone — guards against
# orphans accumulating when stations are removed via paths that bypass the
# observer (DB seed, manual delete, etc).
docker compose exec -T api php artisan stations:reconcile

DEPLOYMENT_ID=$(git rev-parse --short HEAD)
echo ""
echo "✓ Deployed $DEPLOYMENT_ID"
echo "  Logs: COMPOSE_FILE=docker-compose.yml docker compose logs -f"
