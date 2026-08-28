#!/usr/bin/env bash
# Deploy GoCast on a native host. The nginx/php-fpm counterpart of
# ./deploy.sh, which drives the containerised stack.
#
#   sudo bash infra/native/deploy-native.sh
#
# Must run as root: it reloads systemd services, re-runs setup-native.sh
# (which writes /etc), and drops to $RUN_USER via `sudo -u` for everything
# that touches the app tree — so a deploy never leaves root-owned files that
# php-fpm cannot write.
#
# Safety model, unchanged from deploy.sh:
#   1. A mysqldump taken BEFORE migrations run.
#   2. A health gate after the swap.
#   3. Code rolls back automatically; the DATABASE deliberately does not.
#      `migrate:rollback` unattended is how a failed deploy becomes data
#      loss — a down() that drops a column discards what was in it. The dump
#      path is printed instead so a human decides.
#
# The ordering here is not arbitrary. Migrations run BEFORE the caches are
# rebuilt and the workers restart, so there is never a window where new code
# is live against an old schema. php-fpm is reloaded (not restarted) so
# in-flight uploads finish on the old workers.

set -euo pipefail

cd "$(dirname "$0")/../.."
REPO_ROOT="$(pwd)"
NATIVE="$REPO_ROOT/infra/native"

DOMAINS="$NATIVE/env/domains.env"
[[ -f "$DOMAINS" ]] || { echo "!! missing $DOMAINS"; exit 1; }
# shellcheck disable=SC1090
set -a; source "$DOMAINS"; set +a

if [[ $EUID -ne 0 ]]; then
  echo "!! Run with sudo — this reloads services and re-runs setup-native.sh." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gocast}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"

PREVIOUS_REF="$(git rev-parse HEAD)"
DB_DUMP=""

# Everything that touches the app tree runs as the service user, so a deploy
# never leaves root-owned files that php-fpm then cannot write. This is the
# most common way a native Laravel deploy breaks a day later: bootstrap/cache
# ends up root-owned and the next config:cache fails at 3 AM.
as_app() { sudo -u "$RUN_USER" -H "$@"; }

# `sudo` resets the environment, and `config:cache` stops Laravel from
# loading .env — so without passing DOCKER_HOST explicitly, the
# stations:relaunch and stations:reconcile steps below would fall back to
# /var/run/docker.sock and be denied. Same root cause as the env[] block in
# the php-fpm pool; this is the CLI half of it.
artisan() {
  as_app env "DOCKER_HOST=${DOCKER_HOST_ADDR}" php "$REPO_ROOT/api/artisan" "$@"
}

rollback() {
  echo ""
  echo "!! Deploy failed — rolling back code to ${PREVIOUS_REF:0:8}"
  git reset --hard "$PREVIOUS_REF"
  as_app composer install --no-dev --no-interaction --prefer-dist \
    --optimize-autoloader --working-dir="$REPO_ROOT/api" || true
  artisan config:cache || true
  systemctl reload "php${PHP_VERSION}-fpm" || true
  systemctl restart gocast-queue gocast-scheduler gocast-client || true
  if [[ -n "$DB_DUMP" ]]; then
    echo ""
    echo "  Migrations were NOT reverted. To undo this deploy's schema"
    echo "  changes, restore the pre-migration dump by hand:"
    echo "    gunzip -c $DB_DUMP | mysql -u<user> -p ${DB_DATABASE:-gocast}"
  fi
  exit 1
}

echo "==> Pulling latest source"
git pull --ff-only

# ---------------------------------------------------------------------------
# Pre-migration dump. Local and gzip-only — deliberately NOT the S3 path
# backup.sh takes, because this has to work on a host where object storage
# is misconfigured, which is exactly when you most want a safety net.
# ---------------------------------------------------------------------------
if [[ "${SKIP_DB_BACKUP:-0}" == "1" ]]; then
  echo "==> Skipping pre-migration backup (SKIP_DB_BACKUP=1)"
elif ! command -v mysqldump >/dev/null 2>&1; then
  echo "!! mysqldump not found — refusing to migrate without a backup."
  echo "   apt install mysql-client, or re-run with SKIP_DB_BACKUP=1."
  exit 1
else
  echo "==> Backing up the database"
  # Credentials come from api/.env — the same file the app reads, so there
  # is no second place for them to drift out of sync.
  set -a; source "$REPO_ROOT/api/.env"; set +a
  mkdir -p "$BACKUP_DIR"
  DB_DUMP="$BACKUP_DIR/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  mysqldump --single-transaction --routines --triggers --quick \
    -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" \
    -u"${DB_USERNAME:?}" -p"${DB_PASSWORD:?}" "${DB_DATABASE:?}" \
    | gzip > "$DB_DUMP"
  echo "  ✓ $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1))"
  ls -t "$BACKUP_DIR"/pre-deploy-*.sql.gz 2>/dev/null \
    | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm --
fi

echo "==> Re-provisioning host config"
# Idempotent, and re-renders every template — so a change to domains.env or
# to any config in infra/native/ lands on the box with the code that needs
# it, instead of in a separate step somebody forgets.
bash "$NATIVE/setup-native.sh"

echo "==> PHP dependencies"
as_app composer install --no-dev --no-interaction --prefer-dist \
  --optimize-autoloader --classmap-authoritative \
  --working-dir="$REPO_ROOT/api" || rollback

echo "==> Building the client"
# ---------------------------------------------------------------------------
# NEXT_PUBLIC_* are INLINED INTO THE BROWSER BUNDLE at build time. They are
# build-time env, not runtime env: setting them in the systemd unit does
# nothing at all, because the strings are already baked into the emitted
# JavaScript. This is the single most confusing thing about deploying this
# client — a wrong API URL cannot be fixed by editing a service file.
# ---------------------------------------------------------------------------
as_app env -C "$REPO_ROOT/client" \
  NEXT_TELEMETRY_DISABLED=1 \
  npm ci || rollback

as_app env -C "$REPO_ROOT/client" \
  NEXT_TELEMETRY_DISABLED=1 \
  NODE_ENV=production \
  NEXT_PUBLIC_API_URL="https://${API_HOST}/api" \
  NEXT_PUBLIC_APP_URL="https://${APP_HOST}" \
  NEXT_PUBLIC_ICECAST_URL="https://${ICECAST_HOST}" \
  NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}" \
  SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}" \
  npm run build || rollback

# `output: "standalone"` emits a self-contained server.js, but Next does NOT
# copy public/ or .next/static into it — the Dockerfile did that in its final
# COPY layer, and nothing does it for us here. Without this the site renders
# HTML with no CSS, no JS chunks and no images, which reads as a broken build
# rather than a missing copy.
as_app rm -rf "$REPO_ROOT/client/.next/standalone/public" \
              "$REPO_ROOT/client/.next/standalone/.next/static"
as_app cp -r "$REPO_ROOT/client/public"       "$REPO_ROOT/client/.next/standalone/public"
as_app cp -r "$REPO_ROOT/client/.next/static" "$REPO_ROOT/client/.next/standalone/.next/static"
echo "  ✓ standalone bundle assembled"

echo "==> Migrations"
artisan migrate --force || rollback

echo "==> Storage symlink"
# --relative is required. An absolute link created while the app still ran
# in a container points at /app/storage/app/public, which does not exist on
# the host; the symptom is every piece of station artwork 404ing while the
# files are plainly there on disk.
artisan storage:link --relative || true

echo "==> Caching config, routes, events"
artisan config:clear
artisan config:cache || rollback
artisan route:cache  || rollback
artisan event:cache  || rollback

echo "==> Reloading services"
# reload, not restart: in-flight requests (a 100 MB upload takes minutes)
# finish on the old workers while new ones pick up the new code.
systemctl reload "php${PHP_VERSION}-fpm"
# The workers hold the framework in memory, so they are blind to the new
# code until they exit. queue:restart asks the worker to finish its current
# job and stop; systemd's Restart=always brings it straight back.
artisan queue:restart
systemctl restart gocast-scheduler gocast-client
systemctl reload-or-restart nginx

echo "==> Health gate"
# Local check against the internal vhost, so this passes or fails on the app
# itself rather than on DNS or TLS.
for i in $(seq 1 20); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${INTERNAL_API_PORT}/up" >/dev/null 2>&1; then
    echo "  ✓ api healthy"
    break
  fi
  [[ $i -eq 20 ]] && { echo "  ✗ api never came up"; rollback; }
  sleep 3
done

echo "==> Relaunching on-air stations"
# Scoped to stations whose owner has them ON AIR (desired_state = running).
# Idempotent — restarts those containers so they pick up a re-rendered .liq,
# and recovers any that died. Stations that are off air are left alone.
artisan stations:relaunch || true

echo "==> Reconciling containers against the station table"
# Three-way convergence: removes containers with no station row, removes
# containers for stopped or soft-deleted stations, and starts containers for
# stations that should be on air but are not. Also runs every five minutes
# from gocast-scheduler.
artisan stations:reconcile || true

echo ""
echo "✓ Deployed $(git rev-parse --short HEAD)"
echo "  Previous: ${PREVIOUS_REF:0:8}  (roll back: git reset --hard $PREVIOUS_REF && bash infra/native/deploy-native.sh)"
[[ -n "$DB_DUMP" ]] && echo "  Pre-migration dump: $DB_DUMP"
echo "  Logs: journalctl -u gocast-queue -u gocast-scheduler -u gocast-client -f"
