#!/usr/bin/env bash
# Nightly backup: MySQL dump + Laravel uploads → S3-compatible storage.
#
# Designed for cron:
#   0 3 * * * /opt/gocast/backup.sh >> /var/log/gocast-backup.log 2>&1
#
# Runs as root: /etc/letsencrypt is 0700 and the playlist tree is owned by
# the gocast user.
#
# Credentials are read from api/.env (the same file Laravel uses). Only the
# backup destination has to be supplied separately:
#   BACKUP_S3_BUCKET                          — e.g. "gocast-backups"
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  — for S3 / R2 / B2
#   AWS_ENDPOINT_URL_S3                       — set for R2 / B2 / non-AWS
#
# Put those in /etc/gocast/backup.env and load it from the cron line, or set
# them in the crontab directly.
#
# Retention is enforced by an S3 lifecycle rule on the bucket (30 days
# is sane). Don't try to manage retention from here — race conditions on
# concurrent backup runs are easy to get wrong.

set -euo pipefail

cd "$(dirname "$0")"

# api/.env is the single source of DB credentials on a native host — there is
# no root .env any more (that file existed only because `docker compose up`
# auto-loaded it).
if [[ -f api/.env ]]; then
  set -a; source api/.env; set +a
fi

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET not set}"
: "${DB_PASSWORD:?DB_PASSWORD not set (is api/.env readable?)}"

DATE=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "[$(date -u)] backup $DATE start"

# --- MySQL ---
# Requires `mysqldump` on the host — `apt install mysql-client` if missing.
# --single-transaction = consistent dump without table locks (InnoDB only).
# --routines + --triggers = include stored procs and triggers.
mysqldump \
  --single-transaction --routines --triggers --quick \
  -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" \
  -u"${DB_USERNAME:-gocast}" -p"${DB_PASSWORD}" "${DB_DATABASE:-gocast}" \
  | gzip > "$TMPDIR/mysql-$DATE.sql.gz"

echo "  mysql dump: $(du -h "$TMPDIR/mysql-$DATE.sql.gz" | cut -f1)"

# --- Uploads (storage/app/public) ---
# Straight off the filesystem. This used to be `docker compose exec -T api
# tar`, because storage/ lived in a named volume inside the api container.
# Laravel runs on the host now, so the files are simply here.
tar -czf "$TMPDIR/uploads-$DATE.tar.gz" -C api/storage/app public

echo "  uploads tar: $(du -h "$TMPDIR/uploads-$DATE.tar.gz" | cut -f1)"

# --- TLS state (/etc/letsencrypt) ---
# Holds the ACME account key plus every issued cert. Losing it triggers a
# re-issue — Let's Encrypt rate-limits 50 issuances/domain/week, so repeated
# loss can lock the domain out for days.
#
# This replaces the old `caddy_data` volume backup: Caddy handled ACME when
# the api was a container, certbot does it now. `--exclude` drops the archive
# directory, which is just superseded copies of what live/ already has.
tar -czf "$TMPDIR/letsencrypt-$DATE.tar.gz" \
  --exclude='archive' -C /etc letsencrypt

echo "  letsencrypt tar: $(du -h "$TMPDIR/letsencrypt-$DATE.tar.gz" | cut -f1)"

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
aws s3 cp "$TMPDIR/letsencrypt-$DATE.tar.gz" "s3://${BACKUP_S3_BUCKET}/letsencrypt/"
aws s3 cp "$TMPDIR/playlists-$DATE.tar.gz"  "s3://${BACKUP_S3_BUCKET}/playlists/"

echo "[$(date -u)] backup $DATE complete"
