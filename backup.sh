#!/usr/bin/env bash
# Nightly backup: MySQL dump + Laravel uploads → S3-compatible storage.
#
# Designed for cron:
#   0 3 * * * /opt/gocast/backup.sh >> /var/log/gocast-backup.log 2>&1
#
# Required env (load via .env or systemd):
#   MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE — same as compose
#   BACKUP_S3_BUCKET                          — e.g. "gocast-backups"
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  — for S3 / R2 / B2
#   AWS_ENDPOINT_URL_S3                       — set for R2 / B2 / non-AWS
#
# Retention is enforced by an S3 lifecycle rule on the bucket (30 days
# is sane). Don't try to manage retention from here — race conditions on
# concurrent backup runs are easy to get wrong.

set -euo pipefail

cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET not set}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD not set}"

DATE=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "[$(date -u)] backup $DATE start"

# --- MySQL ---
# Dumps the host MySQL directly (MySQL is no longer containerized; see
# docker-compose.yml header). Requires `mysqldump` installed on the host —
# `apt install mysql-client` if missing.
# --single-transaction = consistent dump without table locks (InnoDB only).
# --routines + --triggers = include stored procs and triggers.
mysqldump \
  --single-transaction --routines --triggers --quick \
  -h "${MYSQL_HOST:-127.0.0.1}" \
  -u"${MYSQL_USER:-gocast}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE:-gocast}" \
  | gzip > "$TMPDIR/mysql-$DATE.sql.gz"

echo "  mysql dump: $(du -h "$TMPDIR/mysql-$DATE.sql.gz" | cut -f1)"

# --- Uploads (storage/app/public) ---
# `api` is the compose service name; base docker-compose.yml is self-contained
# for prod so no extra `-f` flags needed.
docker compose exec -T api tar -czf - -C /app/storage/app public \
  > "$TMPDIR/uploads-$DATE.tar.gz"

echo "  uploads tar: $(du -h "$TMPDIR/uploads-$DATE.tar.gz" | cut -f1)"

# --- Caddy TLS state (caddy_data volume) ---
# Holds Let's Encrypt account keys + issued certs. Losing this triggers a
# re-issue on next boot — Let's Encrypt rate-limits 50 issuances/domain/week,
# so a few restarts after data loss can lock the domain out for days.
docker run --rm \
  -v gocast_caddy_data:/source:ro \
  -v "$TMPDIR":/backup \
  alpine tar -czf "/backup/caddy_data-$DATE.tar.gz" -C /source .

echo "  caddy_data tar: $(du -h "$TMPDIR/caddy_data-$DATE.tar.gz" | cut -f1)"

# --- Station playlists (/var/gocast/playlists) ---
# User-uploaded audio tracks, one subdir per station. liq/ is regenerable
# from DB rows and hls/ is ephemeral segment output — skip both.
tar -czf "$TMPDIR/playlists-$DATE.tar.gz" -C /var/gocast playlists

echo "  playlists tar: $(du -h "$TMPDIR/playlists-$DATE.tar.gz" | cut -f1)"

# --- Push to S3-compatible storage ---
# `aws s3 cp` works against R2, B2, MinIO, and real S3 with the right
# AWS_ENDPOINT_URL_S3.
aws s3 cp "$TMPDIR/mysql-$DATE.sql.gz"      "s3://${BACKUP_S3_BUCKET}/mysql/"
aws s3 cp "$TMPDIR/uploads-$DATE.tar.gz"    "s3://${BACKUP_S3_BUCKET}/uploads/"
aws s3 cp "$TMPDIR/caddy_data-$DATE.tar.gz" "s3://${BACKUP_S3_BUCKET}/caddy_data/"
aws s3 cp "$TMPDIR/playlists-$DATE.tar.gz"  "s3://${BACKUP_S3_BUCKET}/playlists/"

echo "[$(date -u)] backup $DATE complete"
