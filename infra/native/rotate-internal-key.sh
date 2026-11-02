#!/usr/bin/env bash
# Rotate INTERNAL_API_KEY on a native host.
#
#   sudo bash infra/native/rotate-internal-key.sh
#
# Written after the 2026-11-02 Liquidsoap injection: shell commands ran inside a
# station container, and every station script embeds this key (it is what the
# container sends as X-Internal-Key to /api/internal/*). Treat it as leaked.
#
# What it does, in order:
#   1. backs up api/.env (api/.env.bak-<timestamp>, same owner and mode)
#   2. writes a new random INTERNAL_API_KEY into api/.env
#   3. php artisan config:cache — only if the config is cached, since a cached
#      config never reads .env again
#   4. restarts php-fpm and the queue/scheduler workers so they hold the new key
#   5. php artisan stations:relaunch — re-renders every on-air station's .liq
#      with the new key and restarts its container
#
# Between steps 4 and 5 the running stations still send the OLD key, so harbor
# auth and now-playing pushes fail until each station is relaunched. Step 5
# restarts every on-air station (~3s blip each) and disconnects live DJs: run
# it when nobody is mid-show if you can.
#
# Stations that are off have no container. Their old .liq on disk still holds
# the old key, which is harmless once it no longer works, and is re-rendered
# the next time the station starts.
#
# Anything outside Laravel that calls /api/internal/* with the key (a metrics
# scraper hitting /api/internal/metrics, say) must be given the new one by hand.
#
# The key is never printed: it lives in one shell variable and reaches the file
# through awk's environment, not a command line that `ps` could show.
#
# Overrides: PHP_FPM_UNIT (default php8.5-fpm), DOCKER_HOST_ADDR (default from
# infra/native/env/domains.env, as deploy-native.sh uses it).

set -euo pipefail
set +x

cd "$(dirname "$0")/../.."
REPO_ROOT="$(pwd)"
ENV_FILE="$REPO_ROOT/api/.env"
DOMAINS="$REPO_ROOT/infra/native/env/domains.env"

PHP_FPM_UNIT="${PHP_FPM_UNIT:-php8.5-fpm}"
WORKER_UNITS=(gocast-queue gocast-scheduler gocast-realtime)

if [[ $EUID -ne 0 ]]; then
  echo "!! Run with sudo — this restarts systemd services." >&2
  exit 1
fi

[[ -f "$ENV_FILE" ]] || { echo "!! missing $ENV_FILE" >&2; exit 1; }

# The same DOCKER_HOST deploy-native.sh passes to artisan: under sudo, with the
# config cached, stations:relaunch cannot reach Docker without it.
if [[ -z "${DOCKER_HOST_ADDR:-}" && -f "$DOMAINS" ]]; then
  DOCKER_HOST_ADDR="$(sed -n 's/^DOCKER_HOST_ADDR=//p' "$DOMAINS" | tail -n1 | tr -d '"'"'")"
fi

# Artisan runs as whoever owns api/storage, so nothing it writes (the config
# cache, logs, the rendered .liq files) ends up owned by root.
RUN_USER="$(stat -c %U "$REPO_ROOT/api/storage")"
if [[ "$RUN_USER" == "root" ]]; then
  echo "!! api/storage is owned by root; refusing to run artisan as root." >&2
  exit 1
fi

artisan() {
  local env_args=()
  [[ -n "${DOCKER_HOST_ADDR:-}" ]] && env_args+=("DOCKER_HOST=${DOCKER_HOST_ADDR}")
  sudo -u "$RUN_USER" -H env "${env_args[@]}" php "$REPO_ROOT/api/artisan" "$@"
}

# Check every unit before touching anything: a typo in the fpm unit name found
# after the key is changed would leave php-fpm on the old key.
for unit in "$PHP_FPM_UNIT" "${WORKER_UNITS[@]}"; do
  if ! systemctl cat "${unit}.service" >/dev/null 2>&1; then
    echo "!! systemd unit ${unit}.service not found (set PHP_FPM_UNIT if php-fpm is named differently)." >&2
    exit 1
  fi
done

echo "==> Backing up api/.env"
BACKUP="$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"
echo "    $BACKUP"

echo "==> Writing a new INTERNAL_API_KEY"
NEW_KEY="$(openssl rand -hex 32)"
[[ ${#NEW_KEY} -eq 64 ]] || { echo "!! key generation failed" >&2; exit 1; }

TMP="$(umask 077; mktemp "$ENV_FILE.tmp.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
# Replaces every INTERNAL_API_KEY line, appends one if there was none.
NEW_KEY="$NEW_KEY" awk '
  /^[[:space:]]*INTERNAL_API_KEY=/ { print "INTERNAL_API_KEY=" ENVIRON["NEW_KEY"]; done = 1; next }
  { print }
  END { if (!done) print "INTERNAL_API_KEY=" ENVIRON["NEW_KEY"] }
' "$BACKUP" > "$TMP"
unset NEW_KEY
# Into the existing file rather than a rename, so its owner and mode stay.
cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"

if [[ -f "$REPO_ROOT/api/bootstrap/cache/config.php" ]]; then
  echo "==> Config is cached: rebuilding it"
  if ! artisan config:cache; then
    echo "!! config:cache failed; restoring the old api/.env. Nothing else was changed." >&2
    cat "$BACKUP" > "$ENV_FILE"
    exit 1
  fi
else
  echo "==> Config is not cached: nothing to rebuild"
fi

echo "==> Restarting ${PHP_FPM_UNIT} and workers"
systemctl restart "$PHP_FPM_UNIT"
for unit in "${WORKER_UNITS[@]}"; do
  systemctl restart "$unit"
done

echo "==> Relaunching on-air stations with the new key"
artisan stations:relaunch

echo "==> Done. Old api/.env kept at $BACKUP (it holds the old key; delete it once you are happy)."
