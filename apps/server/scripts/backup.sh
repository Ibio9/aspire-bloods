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
# PIPEFAIL MATTERS HERE. `pg_dump | gzip` exits with gzip's status, and gzip
# happily succeeds compressing a truncated stream — so without `set -o pipefail`
# (from `set -euo pipefail` above) a pg_dump that died halfway would produce a
# valid .gz containing half a database and this script would exit 0. That is the
# exact shape of "we had backups for eight months and none of them restored".
pg_dump "$DATABASE_URL" --format=plain --no-owner --no-privileges | gzip -9 > "$TMP_PATH"
echo "Dump complete: $(du -h "$TMP_PATH" | cut -f1)"

# ---------------------------------------------------------------------------
# VERIFY THE DUMP BEFORE IT IS CALLED A BACKUP.
#
# An untested backup is not a backup, and the cheapest half of that test can be
# done here, every night, rather than only in a drill:
#
#   1. The archive decompresses. Catches truncation and corruption, which is
#      what a killed container or a full /tmp produces.
#   2. It contains the schema and the tables that matter. A dump against an
#      empty database, a wrong DATABASE_URL, or a role with no read permission
#      on the public schema all produce a small, perfectly valid gzip.
#   3. It is not implausibly small. A floor rather than a comparison with
#      yesterday, because there is no state here to remember yesterday with.
#
# What this deliberately does NOT do is restore it — that needs a Postgres
# SERVER and this image has only the client tools. The restore half is
# scripts/restore-drill.sh, run against a scratch database on a schedule a human
# keeps (see DEPLOYMENT.md → Restoring from a backup).
# ---------------------------------------------------------------------------
echo "Verifying the dump..."
gzip -t "$TMP_PATH" || { echo "The dump does not decompress. Not uploading it." >&2; exit 1; }

UNCOMPRESSED_BYTES=$(gzip -l "$TMP_PATH" | awk 'NR==2 {print $2}')
MIN_BYTES="${BACKUP_MIN_UNCOMPRESSED_BYTES:-262144}"
if [ "${UNCOMPRESSED_BYTES:-0}" -lt "$MIN_BYTES" ]; then
  echo "The dump is ${UNCOMPRESSED_BYTES} bytes uncompressed, below the ${MIN_BYTES} floor. Refusing to upload it." >&2
  exit 1
fi

# The three tables whose absence means the dump is of the wrong database or was
# taken by a role that could not read the schema. Clinical data, identity, and
# the trail — if all three are present with their COPY sections, the dump is of
# this application.
for TABLE in Report ReportResult User; do
  if ! gunzip -c "$TMP_PATH" | grep -q "^COPY public.\"${TABLE}\""; then
    echo "The dump contains no data section for \"${TABLE}\". Refusing to upload it." >&2
    exit 1
  fi
done
echo "Dump verified: ${UNCOMPRESSED_BYTES} bytes uncompressed, schema and data sections present."

LOCAL_SHA=$(sha256sum "$TMP_PATH" | awk '{print $1}')

echo "Uploading to s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}..."
aws s3 cp "$TMP_PATH" "s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}" --endpoint-url "$BACKUP_S3_ENDPOINT"

# READ IT BACK. `aws s3 cp` exiting 0 says the CLI finished, not that the object
# on the other side is the file that left here — and the whole point of an
# off-platform backup is that the other side is somebody else's system. A
# round-trip hash is a few seconds against a database this size and it is the
# difference between "we uploaded something" and "the bytes are there".
echo "Reading the object back to check it arrived intact..."
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}" "${TMP_PATH}.check" --endpoint-url "$BACKUP_S3_ENDPOINT"
REMOTE_SHA=$(sha256sum "${TMP_PATH}.check" | awk '{print $1}')
rm -f "${TMP_PATH}.check"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "The uploaded object does not match what was sent (local ${LOCAL_SHA}, remote ${REMOTE_SHA})." >&2
  exit 1
fi

rm -f "$TMP_PATH"
echo "Uploaded and verified $DUMP_FILE (sha256 ${LOCAL_SHA})"

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
