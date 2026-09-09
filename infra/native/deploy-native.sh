#!/usr/bin/env bash
# Deploy GoCast on a native host. The nginx/php-fpm counterpart of
# the containerised stack's deploy.sh, which is gone.
#
#   sudo bash infra/native/deploy-native.sh
#   sudo FULL_DEPLOY=1 bash infra/native/deploy-native.sh   # ignore the diff, run every step
#
# Must run as root: it reloads systemd services and drops to $RUN_USER via
# `sudo -u` for everything that touches the app tree — so a deploy never
# leaves root-owned files that php-fpm cannot write.
#
# Incremental by default. The commit of the last SUCCESSFUL deploy is kept in
# $DEPLOYED_REF_FILE, and each step below runs only when the files it depends
# on changed between that commit and the new HEAD:
#
#   api/composer.lock changed      -> composer install
#   api/package-lock.json changed  -> npm ci (admin assets)
#   api/resources, vite.config     -> vite build (admin assets)
#   api/database/migrations        -> mysqldump, then migrate
#   anything under api/            -> config/route/event cache, php-fpm reload,
#                                     queue + scheduler restart
#   client/package-lock.json       -> npm ci (client)
#   anything under client/         -> next build, client restart
#
# A deploy that changed nothing in a tree does not touch that tree's services,
# so a client-only change never reloads php-fpm and an API-only change never
# restarts the Next server. FULL_DEPLOY=1 runs everything — use it after a
# hand edit to api/.env (config:cache bakes it in, and .env is not in git), or
# when the ref file is missing or stale.
#
# Two things are not in git and still have to be watched:
#   - the composer autoloader is built --classmap-authoritative, which turns
#     off PSR-4 lookup, so any api/ change re-dumps it even when composer.lock
#     did not move — otherwise a new class is simply "not found";
#   - infra/native/env/domains.env feeds NEXT_PUBLIC_* into the client bundle,
#     so its hash is stamped next to the ref file and a change forces a client
#     rebuild (the vhosts it also feeds are still setup-native.sh's job).
#
# On failure the code goes back to the last SUCCESSFUL deploy (the ref file),
# not merely to whatever HEAD was before the pull — a retry after an aborted
# deploy would otherwise "roll back" to a commit that never ran.
#
# Host provisioning (nginx, php-fpm pool, systemd units, icecast, ufw) is NOT
# part of the deploy. setup-native.sh re-renders the vhosts from port-80
# templates and wipes the :443 blocks certbot added in place; run it by hand
# when host config changes, then re-run certbot:
#   sudo bash infra/native/setup-native.sh
#   sudo certbot --nginx --cert-name <name>
#
# On-air station containers are NOT restarted by the deploy either. The
# reconcile step at the end starts containers that should be running but are
# not, and leaves healthy ones alone. After a change to the Liquidsoap image
# or the .liq template, restart them by hand (~3s blip per station, live DJs
# are disconnected):
#   sudo -u $RUN_USER php api/artisan stations:relaunch
#
# Safety model:
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
  echo "!! Run with sudo — this reloads systemd services." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gocast}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"
DEPLOYED_REF_FILE="${DEPLOYED_REF_FILE:-/var/lib/gocast/deployed-ref}"
DEPLOYED_ENV_FILE="${DEPLOYED_ENV_FILE:-${DEPLOYED_REF_FILE}.env-sha256}"

PREVIOUS_REF="$(git rev-parse HEAD)"
# The last commit that deployed cleanly, if the ref file names one. This is
# what a failed deploy rolls back to; PREVIOUS_REF is only the fallback.
LAST_GOOD_REF=""
if [[ -f "$DEPLOYED_REF_FILE" ]] && git cat-file -e "$(cat "$DEPLOYED_REF_FILE")^{commit}" 2>/dev/null; then
  LAST_GOOD_REF="$(cat "$DEPLOYED_REF_FILE")"
fi
DOMAINS_SHA="$(sha256sum "$DOMAINS" | cut -d' ' -f1)"
DB_DUMP=""
COMPOSER_RAN=0
API_CHANGED=0
CLIENT_CHANGED=0
CLIENT_BUILD_STARTED=0

# Everything that touches the app tree runs as the service user, so a deploy
# never leaves root-owned files that php-fpm then cannot write. This is the
# most common way a native Laravel deploy breaks a day later: bootstrap/cache
# ends up root-owned and the next config:cache fails at 3 AM.
as_app() { sudo -u "$RUN_USER" -H "$@"; }

# `sudo` resets the environment, and `config:cache` stops Laravel from
# loading .env — so without passing DOCKER_HOST explicitly, the
# stations:reconcile step below would fall back to /var/run/docker.sock and
# be denied. Same root cause as the env[] block in the php-fpm pool; this is
# the CLI half of it.
artisan() {
  as_app env "DOCKER_HOST=${DOCKER_HOST_ADDR}" php "$REPO_ROOT/api/artisan" "$@"
}

# next build + the standalone assembly, for the deploy and for a rollback
# that has to rebuild the client it half-replaced. Returns non-zero on any
# failed step; the caller decides what that means.
build_client() {
  as_app env -C "$REPO_ROOT/client" \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NEXT_PUBLIC_API_URL="https://${API_HOST}/api" \
    NEXT_PUBLIC_APP_URL="https://${APP_HOST}" \
    NEXT_PUBLIC_ICECAST_URL="https://${ICECAST_HOST}" \
    NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}" \
    SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}" \
    npm run build || return 1

  # `output: "standalone"` emits a self-contained server.js, but Next does NOT
  # copy public/ or .next/static into it — the Dockerfile did that in its
  # final COPY layer, and nothing does it for us here. Without this the site
  # renders HTML with no CSS, no JS chunks and no images, which reads as a
  # broken build rather than a missing copy.
  as_app rm -rf "$REPO_ROOT/client/.next/standalone/public" \
                "$REPO_ROOT/client/.next/standalone/.next/static"
  as_app cp -r "$REPO_ROOT/client/public"       "$REPO_ROOT/client/.next/standalone/public" || return 1
  as_app cp -r "$REPO_ROOT/client/.next/static" "$REPO_ROOT/client/.next/standalone/.next/static" || return 1
}

rollback() {
  local target="${LAST_GOOD_REF:-$PREVIOUS_REF}"
  echo ""
  echo "!! Deploy failed — rolling back code to ${target:0:8}"
  git reset --hard "$target"
  if [[ $COMPOSER_RAN -eq 1 ]]; then
    as_app composer install --no-dev --no-interaction --prefer-dist \
      --optimize-autoloader --classmap-authoritative \
      --working-dir="$REPO_ROOT/api" || true
  elif [[ $API_CHANGED -eq 1 ]]; then
    as_app composer dump-autoload --no-dev --optimize --classmap-authoritative \
      --working-dir="$REPO_ROOT/api" || true
  fi
  artisan config:cache || true
  systemctl reload "php${PHP_VERSION}-fpm" || true
  systemctl restart gocast-queue gocast-scheduler || true
  # `next build` overwrites .next in place, so once it has started the tree
  # on disk is neither the old build nor a whole new one. Resetting the
  # source does not bring the old bundle back; only a rebuild does. Until it
  # has started, the running client is untouched and is left alone.
  if [[ $CLIENT_BUILD_STARTED -eq 1 ]]; then
    echo "!! Rebuilding the client from ${target:0:8}"
    if build_client; then
      systemctl restart gocast-client || true
    else
      echo "!! Client rebuild failed too — gocast-client was NOT restarted and is"
      echo "   serving whatever is in client/.next. Fix and re-run with FULL_DEPLOY=1."
    fi
  fi
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
NEW_REF="$(git rev-parse HEAD)"

# ---------------------------------------------------------------------------
# Work out what changed since the last successful deploy. The base is the ref
# file, not $PREVIOUS_REF: a deploy that aborted after the pull leaves HEAD
# already moved, and diffing against it would skip every step on the retry.
# ---------------------------------------------------------------------------
BASE_REF=""
if [[ "${FULL_DEPLOY:-0}" == "1" ]]; then
  echo "==> FULL_DEPLOY=1 — running every step"
elif [[ -n "$LAST_GOOD_REF" ]]; then
  BASE_REF="$LAST_GOOD_REF"
  echo "==> Last successful deploy: ${BASE_REF:0:8} — deploying ${BASE_REF:0:8}..${NEW_REF:0:8}"
else
  echo "==> No record of a previous deploy ($DEPLOYED_REF_FILE) — running every step"
fi

# changed <path>... — true when any of the paths differ between the last
# deployed commit and HEAD. With no base, everything counts as changed.
changed() {
  [[ -z "$BASE_REF" ]] && return 0
  ! git diff --quiet "$BASE_REF" "$NEW_REF" -- "$@"
}

changed api/    && API_CHANGED=1
changed client/ && CLIENT_CHANGED=1

# domains.env is gitignored, so `changed` cannot see it — but NEXT_PUBLIC_*
# are baked into the client bundle from it. Compare against the hash stamped
# by the last successful deploy; no stamp counts as changed.
ENV_CHANGED=0
if [[ -n "$BASE_REF" ]]; then
  if [[ ! -f "$DEPLOYED_ENV_FILE" || "$(cat "$DEPLOYED_ENV_FILE")" != "$DOMAINS_SHA" ]]; then
    ENV_CHANGED=1
    CLIENT_CHANGED=1
    echo "  domains.env changed since the last deploy — the client will be rebuilt"
  fi
fi

if [[ $API_CHANGED -eq 0 && $CLIENT_CHANGED -eq 0 ]]; then
  echo "  nothing under api/ or client/ changed — services will not be touched"
fi

# Things this script deliberately does not apply. Say so up front, so the
# manual step is not discovered from a symptom a day later.
MANUAL_STEPS=()
if changed infra/native || [[ $ENV_CHANGED -eq 1 ]]; then
  MANUAL_STEPS+=("host config under infra/native/ (or domains.env) changed — after this deploy run:
       sudo bash infra/native/setup-native.sh && sudo certbot --nginx --cert-name <name>")
fi
if changed infra/liquidsoap; then
  MANUAL_STEPS+=("the Liquidsoap image under infra/liquidsoap/ changed — rebuild it and relaunch:
       docker build -t gocast/liquidsoap:latest infra/liquidsoap/
       sudo -u $RUN_USER php api/artisan stations:relaunch")
fi
if changed api/resources/views/liquidsoap api/app/Services/LiquidsoapSupervisor.php; then
  MANUAL_STEPS+=("the station .liq template or supervisor changed — running stations keep
       the OLD config until relaunched (~3s blip each, live DJs disconnect):
       sudo -u $RUN_USER php api/artisan stations:relaunch")
fi
if [[ ${#MANUAL_STEPS[@]} -gt 0 ]]; then
  echo ""
  for step in "${MANUAL_STEPS[@]}"; do echo "  !! $step"; done
  echo ""
fi

# ---------------------------------------------------------------------------
# Pre-migration dump. Local and gzip-only — deliberately NOT the S3 path
# backup.sh takes, because this has to work on a host where object storage
# is misconfigured, which is exactly when you most want a safety net.
# Only taken when there are migrations to run — that is the only step here
# that can change the schema.
# ---------------------------------------------------------------------------
MIGRATE=0; changed api/database/migrations && MIGRATE=1

if [[ $MIGRATE -eq 0 ]]; then
  echo "==> No new migrations — skipping backup"
elif [[ "${SKIP_DB_BACKUP:-0}" == "1" ]]; then
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

if changed api/composer.lock api/composer.json; then
  echo "==> PHP dependencies"
  COMPOSER_RAN=1
  as_app composer install --no-dev --no-interaction --prefer-dist \
    --optimize-autoloader --classmap-authoritative \
    --working-dir="$REPO_ROOT/api" || rollback
elif [[ $API_CHANGED -eq 1 ]]; then
  # --classmap-authoritative means the autoloader never falls back to
  # scanning the filesystem, so a class added in this deploy is unknown to
  # it until the classmap is regenerated — and "Class App\... not found"
  # on the first request is how that shows up. Dependencies are untouched;
  # only the map is rebuilt.
  echo "==> PHP dependencies unchanged — refreshing the class map"
  as_app composer dump-autoload --no-dev --optimize --classmap-authoritative \
    --working-dir="$REPO_ROOT/api" || rollback
else
  echo "==> PHP dependencies unchanged"
fi

# api/ has its own Vite build (resources/css/admin.css + app.js) that emits
# public/build/manifest.json. The Blade admin panel calls @vite(), which
# throws "Vite manifest not found" without it -- so every route under /admin
# 500s on a fresh checkout. Separate from the client build below: different
# package.json, different bundler, different output tree. Tailwind scans the
# Blade views for class names, so all of resources/ is an input, not just
# css/ and js/.
if changed api/package-lock.json api/package.json; then
  echo "==> Admin asset dependencies"
  # NOT NODE_ENV=production here. npm reads it and omits devDependencies --
  # and api/package.json lists vite, tailwind and the laravel plugin as dev
  # deps, which is correct (they are build tools, not runtime deps). Setting
  # it wipes node_modules and installs nothing usable, and the build below
  # then dies on "sh: 1: vite: not found". --include=dev also overrides a
  # global `npm config set production true` on the host. The build itself
  # still runs with NODE_ENV=production, which is what Tailwind and Vite
  # actually read for minification.
  as_app env -C "$REPO_ROOT/api" npm ci --include=dev || rollback
fi
if changed api/resources api/vite.config.js api/package-lock.json api/package.json; then
  echo "==> Building the admin assets"
  as_app env -C "$REPO_ROOT/api" NODE_ENV=production npm run build || rollback
  echo "  ✓ public/build"
else
  echo "==> Admin assets unchanged"
fi

# ---------------------------------------------------------------------------
# NEXT_PUBLIC_* are INLINED INTO THE BROWSER BUNDLE at build time. They are
# build-time env, not runtime env: setting them in the systemd unit does
# nothing at all, because the strings are already baked into the emitted
# JavaScript. This is the single most confusing thing about deploying this
# client — a wrong API URL cannot be fixed by editing a service file.
# ---------------------------------------------------------------------------
if changed client/package-lock.json client/package.json; then
  echo "==> Client dependencies"
  as_app env -C "$REPO_ROOT/client" \
    NEXT_TELEMETRY_DISABLED=1 \
    npm ci || rollback
fi
if [[ $CLIENT_CHANGED -eq 1 ]]; then
  echo "==> Building the client"
  CLIENT_BUILD_STARTED=1
  build_client || rollback
  echo "  ✓ standalone bundle assembled"
else
  echo "==> Client unchanged"
fi

if [[ $MIGRATE -eq 1 ]]; then
  echo "==> Migrations"
  artisan migrate --force || rollback
fi

if [[ $API_CHANGED -eq 1 ]]; then
  echo "==> Storage symlink"
  # --relative is required. An absolute link created while the app still ran
  # in a container points at /app/storage/app/public, which does not exist on
  # the host; the symptom is every piece of station artwork 404ing while the
  # files are plainly there on disk.
  artisan storage:link --relative || true

  echo "==> Caching config, routes, events"
  # view:clear matters as much as the caches below. Compiled Blade lives in
  # storage/framework/views keyed by source path, so a template that still
  # compiles is never re-compiled -- even when the classes it referenced are
  # gone. Removing Filament left a compiled welcome.blade.php calling
  # Livewire\Mechanisms\ExtendBlade, which 500'd the API root until cleared.
  artisan view:clear   || rollback
  artisan config:clear || rollback
  artisan config:cache || rollback
  artisan route:cache  || rollback
  artisan event:cache  || rollback

  echo "==> Reloading API services"
  # reload, not restart: in-flight requests (a 100 MB upload takes minutes)
  # finish on the old workers while new ones pick up the new code.
  systemctl reload "php${PHP_VERSION}-fpm" || rollback
  # The workers hold the framework in memory, so they are blind to the new
  # code until they exit. queue:restart asks the worker to finish its current
  # job and stop; systemd's Restart=always brings it straight back.
  artisan queue:restart || rollback
  systemctl restart gocast-scheduler || rollback
fi

if [[ $CLIENT_CHANGED -eq 1 ]]; then
  echo "==> Restarting the client"
  systemctl restart gocast-client || rollback
fi

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

echo "==> Reconciling containers against the station table"
# Three-way convergence: removes containers with no station row, removes
# containers for stopped or soft-deleted stations, and starts containers for
# stations that should be on air but are not. Healthy running containers are
# left alone. Also runs every five minutes from gocast-scheduler.
artisan stations:reconcile || true

ROLLBACK_HINT="${LAST_GOOD_REF:-$PREVIOUS_REF}"
mkdir -p "$(dirname "$DEPLOYED_REF_FILE")"
echo "$NEW_REF" > "$DEPLOYED_REF_FILE"
echo "$DOMAINS_SHA" > "$DEPLOYED_ENV_FILE"

echo ""
echo "✓ Deployed $(git rev-parse --short HEAD)"
echo "  Previous: ${ROLLBACK_HINT:0:8}  (roll back: git reset --hard $ROLLBACK_HINT && FULL_DEPLOY=1 bash infra/native/deploy-native.sh)"
[[ -n "$DB_DUMP" ]] && echo "  Pre-migration dump: $DB_DUMP"
echo "  Logs: journalctl -u gocast-queue -u gocast-scheduler -u gocast-client -f"
if [[ ${#MANUAL_STEPS[@]} -gt 0 ]]; then
  echo ""
  echo "  Manual steps still owed:"
  for step in "${MANUAL_STEPS[@]}"; do echo "  !! $step"; done
fi
