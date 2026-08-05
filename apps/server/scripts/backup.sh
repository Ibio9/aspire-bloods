#!/usr/bin/env bash
# Runs as a Railway Cron Service (see backup.Dockerfile) — nightly pg_dump
# to off-platform S3-compatible storage (R2), gzip-compressed, 35-day
# retention. Uses the private DATABASE_URL (Railway internal networking),
# never a publicly-exposed Postgres connection. Fails loudly at every step
# rather than silently skipping — a cron job that "succeeds" while doing
# nothing is worse than one that visibly fails.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set — see DEPLOYMENT.md. Refusing to silently skip the backup." >&2
  exit 1
fi
if [ -z "${BACKUP_S3_ACCESS_KEY_ID:-}" ] || [ -z "${BACKUP_S3_SECRET_ACCESS_KEY:-}" ] || [ -z "${BACKUP_S3_ENDPOINT:-}" ] || [ -z "${BACKUP_S3_BUCKET:-}" ]; then
  echo "One or more BACKUP_S3_* variables are not set — see DEPLOYMENT.md. Refusing to silently skip the backup." >&2
  exit 1
fi

export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
# R2 (and most S3-compatible services) don't use AWS regions, but the
# CLI requires one to be set to something.
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}"

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DUMP_FILE="aspire-bloods-${STAMP}.sql.gz"
TMP_PATH="/tmp/${DUMP_FILE}"

echo "Dumping database..."
pg_dump "$DATABASE_URL" --format=plain --no-owner --no-privileges | gzip -9 > "$TMP_PATH"
echo "Dump complete: $(du -h "$TMP_PATH" | cut -f1)"

echo "Uploading to s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}..."
aws s3 cp "$TMP_PATH" "s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}" --endpoint-url "$BACKUP_S3_ENDPOINT"
rm -f "$TMP_PATH"
echo "Uploaded $DUMP_FILE"

echo "Pruning backups older than ${BACKUP_RETENTION_DAYS:-35} days..."
# busybox date (this image's base) doesn't understand GNU's "N days ago"
# syntax — epoch arithmetic works on both.
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"
CUTOFF_EPOCH=$(( $(date -u +%s) - RETENTION_DAYS * 86400 ))
CUTOFF=$(date -u -d "@${CUTOFF_EPOCH}" +%Y-%m-%d)
aws s3 ls "s3://${BACKUP_S3_BUCKET}/" --endpoint-url "$BACKUP_S3_ENDPOINT" | while read -r line; do
  FILE_DATE=$(echo "$line" | awk '{print $1}')
  FILE_NAME=$(echo "$line" | awk '{print $4}')
  if [[ -n "$FILE_NAME" && "$FILE_DATE" < "$CUTOFF" ]]; then
    echo "Deleting expired backup: $FILE_NAME"
    aws s3 rm "s3://${BACKUP_S3_BUCKET}/${FILE_NAME}" --endpoint-url "$BACKUP_S3_ENDPOINT"
  fi
done

echo "Backup job complete."
