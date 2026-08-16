#!/usr/bin/env bash
# Production deploy. One command: back up, pull, build, migrate, swap, verify.
#
# Usage:
#   ./deploy.sh
#
# Requires:
#   - .env at the repo root (copy from .env.docker.example)
#   - MySQL running on the host with the `gocast` database created and the
#     gocast user granted access. See docker-compose.yml header for the
#     one-time setup commands.
#   - mysqldump on the host (`apt install mysql-client`) for the pre-migration
#     safety dump. Set SKIP_DB_BACKUP=1 to bypass, at your own risk.
#
# What this does NOT do:
#   - Configure the host (firewall, MySQL install, TLS DNS records)
#   - Roll back the DATABASE. See the rollback section below for why.
#
# Per-station Liquidsoap containers are managed by the app itself
# (App\Services\LiquidsoapSupervisor, driven by StationLifecycleService).
# A container exists only while a station's owner has it ON AIR
# (stations.desired_state = running) — creating a station does not start one.
# The relaunch + reconcile steps below bring the running set back in line
# after a deploy; there are no systemd units involved.
#
# Safety model
# ------------
# Three things guard a bad deploy:
#   1. A local mysqldump taken BEFORE migrations run, so a destructive or
#      half-applied migration is recoverable.
#   2. A health gate after the swap — the deploy does not report success
#      until the api container actually reports healthy.
#   3. Automatic rollback of CODE (git ref + images) if the gate fails.
#
# Code rolls back automatically; the database deliberately does not. Running
# `migrate:rollback` unattended is how you turn a failed deploy into data
# loss — a `down()` that drops a column discards the data in it, and plenty
# of migrations have no meaningful inverse. The dump path is printed instead
# so a human can decide.

set -euo pipefail

cd "$(dirname "$0")"

# Skip the dev override file in prod. The base docker-compose.yml is
# self-contained for production deploys.
export COMPOSE_FILE=docker-compose.yml

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gocast}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

# Captured before the pull so rollback has somewhere to go.
PREVIOUS_REF="$(git rev-parse HEAD)"
DB_DUMP=""

# ---------------------------------------------------------------------------
# Wait for a compose service to report healthy.
#
# Polls the container's health status rather than sleeping a fixed amount:
# the api's healthcheck has a 30s start_period, and image pulls make boot
# time unpredictable. Services with no healthcheck report "none" and are
# treated as ready, since there is nothing to wait on.
# ---------------------------------------------------------------------------
wait_healthy() {
  local svc="$1" elapsed=0 cid status

  while [[ "$elapsed" -lt "$HEALTH_TIMEOUT" ]]; do
    cid="$(docker compose ps -q "$svc" 2>/dev/null || true)"

    if [[ -n "$cid" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo "missing")"

      case "$status" in
        healthy|none) return 0 ;;
        unhealthy)
          echo "  ✗ $svc reported unhealthy"
          return 1
          ;;
      esac
    fi

    sleep 3
    elapsed=$((elapsed + 3))
  done

  echo "  ✗ $svc did not become healthy within ${HEALTH_TIMEOUT}s"
  return 1
}

# ---------------------------------------------------------------------------
# Roll the CODE back to the ref we deployed from and rebuild.
#
# Deliberately does not touch the database — see the safety model above.
# ---------------------------------------------------------------------------
rollback() {
  echo ""
  echo "!! Deploy failed — rolling back code to ${PREVIOUS_REF:0:8}"

  git reset --hard "$PREVIOUS_REF"
  docker compose build
  docker compose up -d --remove-orphans

  if wait_healthy api; then
    echo "  ✓ Rolled back to ${PREVIOUS_REF:0:8} and healthy"
  else
    echo "  ✗ ROLLBACK ALSO UNHEALTHY — the previous version is not coming up."
    echo "    Inspect: COMPOSE_FILE=docker-compose.yml docker compose logs api"
  fi

  if [[ -n "$DB_DUMP" ]]; then
    echo ""
    echo "  Migrations were NOT reverted. If this deploy's migrations need"
    echo "  undoing, restore the pre-migration dump by hand:"
    echo "    gunzip -c $DB_DUMP | mysql -h 127.0.0.1 -u<user> -p <database>"
  fi

  exit 1
}

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

# ---------------------------------------------------------------------------
# Pre-migration database dump.
#
# Local and uncompressed-to-gzip only — deliberately NOT the S3 path that
# backup.sh takes. This has to work on a host where object storage is
# misconfigured or unreachable, because that is exactly when you most want a
# safety net. backup.sh remains the scheduled off-host backup.
# ---------------------------------------------------------------------------
if [[ "${SKIP_DB_BACKUP:-0}" == "1" ]]; then
  echo "==> Skipping pre-migration backup (SKIP_DB_BACKUP=1)"
elif ! command -v mysqldump >/dev/null 2>&1; then
  echo "!! mysqldump not found — refusing to migrate without a backup."
  echo "   Install it (apt install mysql-client) or re-run with SKIP_DB_BACKUP=1."
  exit 1
else
  echo "==> Backing up the database before migrating"

  # Credentials live in the root .env, same file compose reads.
  if [[ -f .env ]]; then
    set -a; source .env; set +a
  fi

  mkdir -p "$BACKUP_DIR"
  DB_DUMP="$BACKUP_DIR/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

  mysqldump \
    --single-transaction --routines --triggers --quick \
    -h "${MYSQL_HOST:-127.0.0.1}" \
    -u"${MYSQL_USER:-gocast}" -p"${MYSQL_PASSWORD:?MYSQL_PASSWORD not set}" \
    "${MYSQL_DATABASE:-gocast}" \
    | gzip > "$DB_DUMP"

  echo "  ✓ $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1))"

  # Keep the last N dumps. `ls -t` newest-first, skip the first N, delete
  # the rest. Retention here is only about not filling the disk; the
  # off-host copies in S3 are governed by the bucket lifecycle rule.
  ls -t "$BACKUP_DIR"/pre-deploy-*.sql.gz 2>/dev/null \
    | tail -n +$((BACKUP_KEEP + 1)) \
    | xargs -r rm --
fi

echo "==> Starting services"
docker compose up -d --remove-orphans

echo "==> Waiting for the api to come up"
wait_healthy api || rollback
echo "  ✓ api healthy"

echo "==> Running migrations (idempotent)"
docker compose exec -T api php artisan migrate --force || rollback

echo "==> Caching config + routes"
docker compose exec -T api php artisan config:cache
docker compose exec -T api php artisan route:cache
docker compose exec -T api php artisan event:cache

echo "==> Ensuring every ON-AIR station's Liquidsoap container is running"
# Scoped to stations whose owner has them on air (desired_state = running).
# Idempotent — restarts those containers (~3s each) so they pick up a new
# .liq template, and recovers any that died since the last deploy. Stations
# that are off air are deliberately left alone.
docker compose exec -T api php artisan stations:relaunch

echo "==> Reconciling Liquidsoap containers against the station table"
# Three-way convergence: removes containers with no station row (orphans),
# removes containers for stations that are stopped or soft-deleted, and
# starts containers for stations that should be on air but aren't. Also runs
# every five minutes from the scheduler.
docker compose exec -T api php artisan stations:reconcile

# Final gate. The caching steps above rewrite config and routes inside the
# running container, so "healthy before migrate" is not proof of "healthy
# now" — a bad config:cache surfaces here.
echo "==> Verifying the stack after cache warm"
wait_healthy api || rollback

DEPLOYMENT_ID=$(git rev-parse --short HEAD)
echo ""
echo "✓ Deployed $DEPLOYMENT_ID"
echo "  Previous: ${PREVIOUS_REF:0:8}  (roll back: git reset --hard $PREVIOUS_REF && ./deploy.sh)"
[[ -n "$DB_DUMP" ]] && echo "  Pre-migration dump: $DB_DUMP"
echo "  Logs: COMPOSE_FILE=docker-compose.yml docker compose logs -f"
