#!/usr/bin/env bash
# =============================================================================
#  THE RESTORE DRILL. AN UNTESTED BACKUP IS NOT A BACKUP.
# =============================================================================
#
# backup.sh checks that the dump it uploaded decompresses, contains the tables
# that matter and arrived intact. That is the half of the test a nightly cron
# container can do — it has the Postgres CLIENT tools and no server to restore
# into. This is the other half, run by a person against a scratch database:
#
#   1. Restore a real backup into an empty database, with ON_ERROR_STOP so a
#      failure halfway is a failure rather than a partial database.
#   2. Compare EVERY table's row count against the source.
#   3. Spot-check one released report end to end — the report row, its result
#      count, and a hash over the encrypted values and statuses of its results,
#      so a restore that silently dropped or reordered rows is caught rather
#      than merely counted.
#
# It reads nothing and writes nothing outside the scratch database, and it
# refuses to run if the scratch name looks like anything real.
#
# USAGE
#   ./restore-drill.sh --from-s3 aspire-bloods-2026-08-12T03-15-00Z.sql.gz
#   ./restore-drill.sh --dump-file ./some-backup.sql.gz
#   ./restore-drill.sh                       # takes a fresh dump of SOURCE_URL
#
# ENVIRONMENT
#   SOURCE_URL     the database to compare against (default: $DATABASE_URL)
#   SCRATCH_URL    where to restore. MUST end in a database whose name contains
#                  "drill" or "scratch" — see the guard below.
#   BACKUP_S3_*    only needed for --from-s3
#
# WHY THE COMPARISON IS AGAINST A LIVE SOURCE. A restore you cannot compare with
# anything tells you the file parsed. The counts are the cheapest statement that
# the file is a backup OF SOMETHING, and the hash is the cheapest statement that
# the rows inside it are the rows that were there.
set -euo pipefail

SOURCE_URL="${SOURCE_URL:-${DATABASE_URL:-}}"
SCRATCH_URL="${SCRATCH_URL:-}"
DUMP_FILE=""
S3_KEY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --from-s3) S3_KEY="$2"; shift 2 ;;
    --dump-file) DUMP_FILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$SOURCE_URL" ]; then
  echo "SOURCE_URL (or DATABASE_URL) is not set. There is nothing to compare the restore against." >&2
  exit 1
fi
if [ -z "$SCRATCH_URL" ]; then
  echo "SCRATCH_URL is not set. Refusing to guess where to restore a database dump." >&2
  exit 1
fi

# THE GUARD. This script drops and recreates whatever SCRATCH_URL points at, so
# the one mistake it must make impossible is being pointed at production. A name
# check rather than a host check: a scratch database on the production server is
# a legitimate place to drill, and a database called "aspire_bloods" is never a
# legitimate place to restore over, wherever it lives.
SCRATCH_DB="${SCRATCH_URL##*/}"
SCRATCH_DB="${SCRATCH_DB%%\?*}"
case "$SCRATCH_DB" in
  *drill*|*scratch*) : ;;
  *)
    echo "SCRATCH_URL points at a database called '${SCRATCH_DB}'." >&2
    echo "This script DROPS that database. Its name must contain 'drill' or 'scratch'." >&2
    exit 1
    ;;
esac

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

if [ -n "$S3_KEY" ]; then
  export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}"
  DUMP_FILE="${WORK_DIR}/backup.sql.gz"
  echo "Downloading s3://${BACKUP_S3_BUCKET}/${S3_KEY}..."
  aws s3 cp "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" "$DUMP_FILE" --endpoint-url "$BACKUP_S3_ENDPOINT"
elif [ -z "$DUMP_FILE" ]; then
  DUMP_FILE="${WORK_DIR}/backup.sql.gz"
  echo "No dump given — taking a fresh one from SOURCE_URL..."
  pg_dump "$SOURCE_URL" --format=plain --no-owner --no-privileges | gzip -9 > "$DUMP_FILE"
fi

echo "Checking the archive..."
gzip -t "$DUMP_FILE"
echo "  decompresses cleanly ($(du -h "$DUMP_FILE" | cut -f1))"

# The scratch database, empty. Created through the maintenance database rather
# than the scratch one, since you cannot drop a database you are connected to.
ADMIN_URL="${SCRATCH_URL%/*}/postgres"
echo "Recreating ${SCRATCH_DB}..."
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\";"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"${SCRATCH_DB}\";"

# ON_ERROR_STOP is the whole point of this line. Without it psql prints errors,
# carries on, and exits 0 — which is a half-restored database reported as a
# successful restore.
echo "Restoring..."
gunzip -c "$DUMP_FILE" | psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 -q > /dev/null
echo "  restored"

echo
printf '%-36s %10s %10s  %s\n' 'TABLE' 'SOURCE' 'RESTORED' ''
MISMATCHES=0
TABLES=$(psql "$SOURCE_URL" -At -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")
for TABLE in $TABLES; do
  SOURCE_COUNT=$(psql "$SOURCE_URL" -At -c "SELECT count(*) FROM \"$TABLE\"")
  RESTORED_COUNT=$(psql "$SCRATCH_URL" -At -c "SELECT count(*) FROM \"$TABLE\"")
  if [ "$SOURCE_COUNT" = "$RESTORED_COUNT" ]; then
    STATE=ok
  else
    STATE=MISMATCH
    MISMATCHES=$((MISMATCHES + 1))
  fi
  printf '%-36s %10s %10s  %s\n' "$TABLE" "$SOURCE_COUNT" "$RESTORED_COUNT" "$STATE"
done

echo
echo "Spot-checking one released report..."
# The most recent released report, its result count, and a hash over every
# result's encrypted value and status in id order. Counts alone cannot tell a
# restore that dropped one row and duplicated another from one that did neither.
REPORT_SQL="SELECT r.id || ' | ' || r.status || ' | ' || r.\"sampleDate\" || ' | ' || count(rr.id) || ' results | ' ||
  md5(string_agg(rr.id || ':' || rr.\"valueEncrypted\" || ':' || coalesce(rr.status::text, '-'), ',' ORDER BY rr.id))
  FROM \"Report\" r JOIN \"ReportResult\" rr ON rr.\"reportId\" = r.id
  WHERE r.id = (SELECT id FROM \"Report\" WHERE status = 'RELEASED' ORDER BY \"sampleDate\" DESC LIMIT 1)
  GROUP BY r.id, r.status, r.\"sampleDate\""
SOURCE_REPORT=$(psql "$SOURCE_URL" -At -c "$REPORT_SQL")
RESTORED_REPORT=$(psql "$SCRATCH_URL" -At -c "$REPORT_SQL")
echo "  source:   ${SOURCE_REPORT:-(no released report)}"
echo "  restored: ${RESTORED_REPORT:-(no released report)}"

echo
if [ "$MISMATCHES" -ne 0 ]; then
  echo "FAILED: ${MISMATCHES} table(s) do not match." >&2
  exit 1
fi
if [ "$SOURCE_REPORT" != "$RESTORED_REPORT" ]; then
  echo "FAILED: the spot-checked report does not match." >&2
  exit 1
fi
echo "PASSED: every table matches and the spot-checked report is identical."
echo "The scratch database has been left in place for inspection. Drop it when you are done:"
echo "  psql \"${ADMIN_URL}\" -c 'DROP DATABASE \"${SCRATCH_DB}\";'"
