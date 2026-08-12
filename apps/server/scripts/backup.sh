#!/usr/bin/env bash
# =============================================================================
#  THE NIGHTLY OFF-PLATFORM BACKUP.
# =============================================================================
#
# Runs as a Railway Cron Service (see backup.Dockerfile and DEPLOYMENT.md):
# pg_dump over the PRIVATE DATABASE_URL — Railway internal networking, so
# Postgres never needs a public exposure — gzipped, uploaded to S3-compatible
# storage (Cloudflare R2), pruned to BACKUP_RETENTION_DAYS.
#
# ── WHY THIS FILE IS AS DEFENSIVE AS IT IS ─────────────────────────────────
#
# On 12 August 2026 the R2 bucket was inspected for the first time. It was
# 0 bytes, empty, zero Class B operations, and there was no backup service in
# the Railway project at all. The script was correct and had never been
# deployed, for months, and NOTHING ANYWHERE COULD HAVE SAID SO — the only
# evidence a run produced was a log line in a service that did not exist.
#
# Everything below follows from that. A backup job's real failure mode is not
# crashing, it is being absent, and absence is silent by construction. So:
#
#   1. IT RECORDS ITSELF IN THE DATABASE, success or failure, in `BackupRun`.
#      Over the same DATABASE_URL it already holds — no second credential, no
#      second network path. The clinician work queue reads the latest row and
#      warns when it is over 48 hours old OR when there has never been one.
#      "No row since Tuesday" and "a row every night saying it failed" are
#      different problems, so both are written.
#   2. IT EMAILS ESCALATION_EMAIL ON FAILURE, and on a run whose artefact is
#      suspiciously small. curl against Resend, because this image has no Node.
#   3. IT VERIFIES ITSELF BEFORE CALLING THE FILE A BACKUP — see `verify`.
#   4. IT FAILS LOUDLY at every step rather than skipping. A cron job that
#      "succeeds" while doing nothing is worse than one that visibly fails.
#
# The one thing it cannot do is restore, which needs a Postgres SERVER and this
# image has only the client tools. That is scripts/restore-drill.sh.
#
# ── THIS RUNS ON BUSYBOX, NOT ON GNU COREUTILS ─────────────────────────────
#
# The image is postgres:18-alpine. bash is installed (see backup.Dockerfile) so
# the SHELL is real bash — but every ordinary command in it is a BusyBox applet,
# and BusyBox implements a deliberately reduced flag set. On 12 August 2026 that
# cost a night's backup:
#
#   gzip: unrecognized option: l
#   Usage: gzip [-cfkdt123456789] [FILE]...
#   BusyBox v1.37.0 multi-call binary.
#   The dump is  bytes uncompressed, below the 262144 floor. Refusing to
#   upload it.
#
# `gzip -l` reads the uncompressed size out of the gzip trailer and BusyBox does
# not have it. The size came back EMPTY, the empty string lost the numeric
# comparison, and a perfectly good 324 kB dump was refused. Refusing was right —
# the size could not be verified, so the file was not trusted — and it is the
# CHECK that was broken, not the judgement.
#
# So every external command here has been audited against BusyBox, and the ones
# that are used are used in their BusyBox-supported form:
#
#   gzip -9 / -t / -dc     ok. `-l` and `--rsyncable` are GNU-only: `-l` is why
#                          this note exists, and the uncompressed size is now
#                          measured by decompressing to `wc -c` instead, which
#                          both implementations support and which is also the
#                          only form that is right about a multi-member archive.
#   gunzip -c              REPLACED by `gzip -dc`. Both exist here, but the
#                          usage string above is the list this script is allowed
#                          to rely on, and one spelling is one thing to check.
#   wc -c                  ok (reading stdin, so it prints the count alone).
#   date -u +FMT / +%s     ok. `-d "N days ago"` is GNU-only and was already
#                          avoided; `-d @EPOCH` is supported by BusyBox >= 1.21
#                          and is still VALIDATED below rather than trusted,
#                          because a bad cutoff must skip the prune and never
#                          widen it.
#   sed s///g              ok — BRE only. No `-E`, no `-i` without a suffix, and
#                          no GNU `\|` alternation anywhere in this file.
#   awk '{print $N}'       ok. No gensub, no asorti, no length(array).
#   grep -c / -E           ok. `-c` rather than `-q` on purpose — see the table
#                          check below, where `-q` plus pipefail is a live bug
#                          rather than a portability one.
#   tr -d / -cd            ok.
#   du -h, cut -f, rm -f   ok.
#   sha256sum              ok (BusyBox applet; same output shape).
#   stat                   NOT USED. BusyBox `stat` exists but its `-c` format
#                          specifiers differ from GNU's, so file sizes are taken
#                          from `wc -c` throughout.
#   psql/pg_dump/aws/curl/python3   real binaries, not applets. Unaffected.
set -uo pipefail

# ---------------------------------------------------------------------------
# State carried to the reporter at the end. Set as the run progresses so a
# failure at any stage is reported with the stage's own name rather than as a
# generic non-zero exit.
# ---------------------------------------------------------------------------
STAGE="STARTUP"
OBJECT_KEY=""
SIZE_BYTES=""
UNCOMPRESSED_BYTES=""
SHA256=""
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------------------
# A FAILING COMMAND'S OWN WORDS BELONG IN THE FAILURE, NOT ABOVE IT.
#
# On 12 August the job log read, in this order:
#
#   gzip: unrecognized option: l
#   Usage: gzip [-cfkdt123456789] [FILE]...
#   BusyBox v1.37.0 multi-call binary.
#   The dump is  bytes uncompressed, below the 262144 floor.
#
# Three lines of raw stderr from a command nobody had mentioned, then a sentence
# that explains a different thing and does not name gzip — so the actual error
# appears ABOVE its own explanation and reads as unrelated noise. Worse, none of
# it reached the alert email or the BackupRun row, which carry the message only.
#
# So a command whose failure is handled writes its stderr HERE instead of to the
# log, and `fail` attaches it to the message under the stage's own name. One
# event, one line, in one place, in the two records a person actually sees.
# ---------------------------------------------------------------------------
STDERR_LOG="/tmp/aspire-backup-stderr.log"
: >"$STDERR_LOG"

# Runs a simple command with its stderr diverted. Stdout is untouched, so this
# composes with `$(...)`. Pipelines and redirections cannot go through it — they
# write `2>"$STDERR_LOG"` themselves, after truncating it.
run() {
  : >"$STDERR_LOG"
  "$@" 2>"$STDERR_LOG"
}

# Whatever the last diverted command said, as ONE line and bounded. Newlines
# become spaces because this is going into a single-line log message, an email
# body and a database column; 600 characters because a usage string is short and
# a stack of psql notices is not.
last_stderr() {
  [ -s "$STDERR_LOG" ] || return 0
  tr '\n\r\t' '   ' <"$STDERR_LOG" | cut -c1-600
}

# ---------------------------------------------------------------------------
# A SIZE IS A POSITIVE INTEGER OR IT IS NOT A SIZE.
#
# `[ "${UNCOMPRESSED_BYTES:-0}" -lt "$MIN_BYTES" ]` with an EMPTY value is what
# refused the good dump — and it did the right thing for the wrong reason, which
# is the part worth fixing. An empty string is not "a small backup", it is "the
# measurement failed", and those want different messages: one says the database
# may have lost data, the other says this script could not read a number. Being
# accidentally correct here is not a property that survives the next edit.
# ---------------------------------------------------------------------------
is_positive_integer() {
  case "${1:-}" in
    '' | *[!0-9]*) return 1 ;;
  esac
  # Guards "0" and "000" without arithmetic on a string that might be enormous.
  [ "$1" -gt 0 ] 2>/dev/null
}

# Escapes a value for a single-quoted SQL literal, and nothing else. Everything
# this interpolates is produced by this script (a stage name, a filename, an
# error string), so this is belt to the braces rather than the only defence.
sql_quote() {
  printf "%s" "$1" | sed "s/'/''/g"
}

sql_or_null() {
  if [ -z "${1:-}" ]; then printf 'NULL'; else printf "'%s'" "$(sql_quote "$1")"; fi
}

num_or_null() {
  if [ -z "${1:-}" ]; then printf 'NULL'; else printf '%s' "$1"; fi
}

# ---------------------------------------------------------------------------
# EMAIL. Resend over curl, because this image is postgres:18-alpine plus the
# AWS CLI and has no Node runtime to reuse the app's provider.
#
# ESCALATION_EMAIL is the STAFF address and is read here and in exactly two
# other places (CLAUDE.md) — never CLINIC_CONTACT_EMAIL, which is what patients
# see. A backup failure is not something a patient is told about.
#
# Best effort: a mail server being down must never turn a SUCCESSFUL backup
# into a failed job, and must never stop the database row being written. The
# row is the durable record; the email is the interruption.
# ---------------------------------------------------------------------------
send_alert() {
  local subject="$1"
  local body="$2"

  if [ -z "${RESEND_API_KEY:-}" ] || [ -z "${ESCALATION_EMAIL:-}" ]; then
    echo "!! Cannot send the alert: RESEND_API_KEY or ESCALATION_EMAIL is not set on this service." >&2
    echo "!! ${subject}" >&2
    return 0
  fi

  # JSON-encoded with python3, which is already in the image for the AWS CLI.
  # Hand-rolled escaping of a body containing a psql error message is exactly
  # how an alert becomes a 400 on the night it is needed.
  local payload
  payload=$(SUBJECT="$subject" BODY="$body" FROM="${EMAIL_FROM:-Aspire Clinic <no-reply@aspireshield.com>}" TO="$ESCALATION_EMAIL" \
    python3 -c 'import json,os; print(json.dumps({"from":os.environ["FROM"],"to":[os.environ["TO"]],"subject":os.environ["SUBJECT"],"text":os.environ["BODY"]}))')

  curl -s -S -X POST 'https://api.resend.com/emails' \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d "$payload" >/dev/null 2>&1 ||
    echo "!! The alert email could not be sent. The BackupRun row is still the record." >&2
}

# ---------------------------------------------------------------------------
# THE RECORD. Written whatever happens, and written LAST so it carries the
# outcome. `|| true` throughout: a database that cannot be written to is a
# reason to shout, not a reason to lose the exit code that says the backup
# failed.
# ---------------------------------------------------------------------------
record_run() {
  local outcome="$1"
  local error_message="${2:-}"

  if [ -z "${DATABASE_URL:-}" ]; then return 0; fi
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
    INSERT INTO \"BackupRun\" (id, \"startedAt\", \"finishedAt\", outcome, \"objectKey\", \"sizeBytes\", \"uncompressedBytes\", sha256, \"failureStage\", \"errorMessage\")
    VALUES (
      gen_random_uuid()::text,
      '$(sql_quote "$STARTED_AT")'::timestamp,
      now(),
      '${outcome}'::\"BackupOutcome\",
      $(sql_or_null "$OBJECT_KEY"),
      $(num_or_null "$SIZE_BYTES"),
      $(num_or_null "$UNCOMPRESSED_BYTES"),
      $(sql_or_null "$SHA256"),
      $(if [ "$outcome" = 'FAILED' ]; then sql_or_null "$STAGE"; else printf 'NULL'; fi),
      $(sql_or_null "$error_message")
    );" >/dev/null 2>&1 ||
    echo "!! Could not write the BackupRun row. The work queue will report this run as missing." >&2
}

# One exit path for every failure, so no stage can end the script without
# recording itself and without telling somebody.
fail() {
  local message="$1"
  # Read BEFORE record_run and send_alert, both of which run commands of their
  # own — and clear it afterwards so a later stage cannot inherit this one's
  # words. The detail goes into the message itself rather than beside it, so the
  # email, the BackupRun row and the log all carry the same sentence.
  local detail
  detail="$(last_stderr)"
  : >"$STDERR_LOG"
  if [ -n "$detail" ]; then
    message="${message} The command run at the ${STAGE} stage reported: ${detail}"
  fi
  echo "$message" >&2
  record_run 'FAILED' "$message"
  send_alert \
    "Aspire Bloods: the nightly database backup FAILED (${STAGE})" \
    "The nightly off-platform backup failed at the ${STAGE} stage.

  when      ${STARTED_AT}
  detail    ${message}

Nothing was uploaded, or what was uploaded was not verified. The database is
still running normally; what is missing is the off-platform copy of it.

What to check, in order:
  1. The backup service's own logs in Railway (Deployments -> the latest run).
  2. That every BACKUP_S3_* variable is still set on that service.
  3. That the R2 access key has not expired or been rotated.
  4. Run scripts/restore-drill.sh against the most recent object that DID
     upload, to confirm the last good backup is still restorable.

See DEPLOYMENT.md -> Database restore."
  exit 1
}

# ---------------------------------------------------------------------------
# Preconditions. Named individually rather than as one message: "one or more
# variables is missing" sends somebody to read a list of six.
# ---------------------------------------------------------------------------
STAGE="CONFIG"
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set on the backup service. Refusing to silently skip the backup."
for VAR in BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET; do
  eval "VALUE=\${$VAR:-}"
  [ -n "$VALUE" ] || fail "$VAR is not set on the backup service. Refusing to silently skip the backup. See DEPLOYMENT.md."
done

export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
# R2 (and most S3-compatible services) don't use AWS regions, but the
# CLI requires one to be set to something.
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}"

# ---------------------------------------------------------------------------
# THE CLIENT MUST NOT BE OLDER THAN THE SERVER.
#
# pg_dump refuses, outright and with no flag to override it, to dump a server
# whose major version is newer than its own:
#
#   pg_dump: error: aborting because of server version mismatch
#   pg_dump: detail: server version: 18.4 (Debian 18.4-1.pgdg13+1);
#            pg_dump version: 16.14
#
# That is the first real run of this job, on 12 August 2026. The image was
# pinned at postgres:16-alpine to match docker-compose.yml — the LOCAL
# database, which is not the one this container dumps — and Railway's Postgres
# had moved to 18.4.
#
# THE COMMENT IN THE DOCKERFILE ALREADY SAID "bump this if Railway provisions a
# different major version", and a comment is not a check: nobody was told about
# the upgrade, so nothing bumped it. Railway will upgrade Postgres again. This
# reads both numbers at the start of every run so that the next time it happens
# the failure names both versions and says which one to change, instead of
# being a stack trace in a 3am log nobody is watching.
#
# It is FATAL rather than a warning, and deliberately so: pg_dump is going to
# refuse a few lines further down regardless. Failing here means the email and
# the BackupRun row carry the two version numbers, which is the whole fix.
#
# Only the MAJOR version matters, and only in one direction. A client ahead of
# the server is supported all the way back to 9.2 and is the intended state.
# ---------------------------------------------------------------------------
STAGE="VERSION"
SERVER_VERSION_NUM=$(run psql "$DATABASE_URL" -At -c "SELECT current_setting('server_version_num')" || printf '')
SERVER_VERSION_NUM=$(printf '%s' "$SERVER_VERSION_NUM" | tr -cd '0-9')
if ! is_positive_integer "$SERVER_VERSION_NUM"; then
  fail "Could not read the server version from DATABASE_URL. The database is unreachable, or the credentials are wrong — either way there is nothing to dump."
fi
# server_version_num is MMmmmm (180004 for 18.4), and has been since Postgres 10.
SERVER_MAJOR=$(( SERVER_VERSION_NUM / 10000 ))
# `pg_dump (PostgreSQL) 18.4` -> `18.4` -> `18`. The sed strips a suffix as well
# as the minor, so a beta or rc tag (`18beta1`) still yields its major.
CLIENT_VERSION=$(run pg_dump --version | awk '{print $NF}')
CLIENT_MAJOR=$(printf '%s' "$CLIENT_VERSION" | sed 's/[^0-9].*//')
if ! is_positive_integer "$CLIENT_MAJOR"; then
  fail "Could not read pg_dump's own version (\`pg_dump --version\` printed '${CLIENT_VERSION}'). Refusing to run a dump that cannot be version-checked."
fi
echo "Postgres server ${SERVER_MAJOR}, pg_dump client ${CLIENT_MAJOR}."
if [ "$CLIENT_MAJOR" -lt "$SERVER_MAJOR" ]; then
  fail "pg_dump is version ${CLIENT_MAJOR} and the server is version ${SERVER_MAJOR}. pg_dump refuses to dump a server newer than itself, so NO BACKUP CAN BE TAKEN by this image. Fix: change the FROM line in apps/server/backup.Dockerfile to postgres:${SERVER_MAJOR}-alpine (or newer) and redeploy the backup service."
fi

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DUMP_FILE="aspire-bloods-${STAMP}.sql.gz"
TMP_PATH="/tmp/${DUMP_FILE}"

STAGE="DUMP"
echo "Dumping database..."
# PIPEFAIL MATTERS HERE. `pg_dump | gzip` exits with gzip's status, and gzip
# happily succeeds compressing a truncated stream — so without `set -o pipefail`
# (above) a pg_dump that died halfway would produce a valid .gz containing half
# a database and this script would exit 0. That is the exact shape of "we had
# backups for eight months and none of them restored".
: >"$STDERR_LOG"
pg_dump "$DATABASE_URL" --format=plain --no-owner --no-privileges 2>"$STDERR_LOG" | gzip -9 >"$TMP_PATH" 2>>"$STDERR_LOG" ||
  fail "pg_dump failed, or the compressed stream was truncated. Nothing was uploaded."
SIZE_BYTES=$(wc -c <"$TMP_PATH" | tr -cd '0-9')
if ! is_positive_integer "$SIZE_BYTES"; then
  fail "Could not determine the size of the dump file at ${TMP_PATH} — \`wc -c\` produced nothing usable. Refusing to upload a file whose size is unknown."
fi
echo "Dump complete: $(du -h "$TMP_PATH" | cut -f1) (${SIZE_BYTES} bytes compressed)"

# ---------------------------------------------------------------------------
# VERIFY THE DUMP BEFORE IT IS CALLED A BACKUP.
#
# An untested backup is not a backup, and the cheapest half of that test can be
# done here, every night, rather than only in a drill:
#
#   1. The archive decompresses. Catches truncation and corruption, which is
#      what a killed container or a full /tmp produces.
#   2. It is not implausibly small. A floor rather than a comparison with
#      yesterday, because there is no state here to remember yesterday with —
#      except that there now is, so the previous run's size is ALSO compared
#      against, which catches the far more likely failure: a dump that is
#      valid, restorable, and a fraction of the size it was last night.
#   3. It contains the schema and the tables that matter. A dump against an
#      empty database, a wrong DATABASE_URL, or a role with no read permission
#      on the public schema all produce a small, perfectly valid gzip.
# ---------------------------------------------------------------------------
STAGE="VERIFY"
echo "Verifying the dump..."
run gzip -t "$TMP_PATH" || fail "The dump does not decompress. Not uploading it."

# ── THE UNCOMPRESSED SIZE, WITHOUT `gzip -l` ───────────────────────────────
#
# `gzip -l` reads the ISIZE field out of the gzip trailer. BusyBox has no `-l`
# at all (see the audit at the top of this file), so on this image it printed a
# usage string to stderr, nothing to stdout, and the size became the empty
# string — which then lost the numeric comparison below and refused a 324 kB
# dump that was completely fine.
#
# Decompressing to `wc -c` is the portable form, supported by BusyBox and GNU
# alike. It costs a full pass over an archive that is a few hundred kilobytes,
# which is nothing, and it is also the more honest measurement: ISIZE is the
# uncompressed length modulo 2^32 and is per MEMBER, so `gzip -l` is wrong about
# a dump over 4 GB and wrong again about a concatenated archive. `wc -c` counts
# the bytes that come out.
#
# `2>` before the pipe rather than after: gzip's complaint has to be captured
# from gzip, not from wc.
: >"$STDERR_LOG"
UNCOMPRESSED_BYTES=$(gzip -dc "$TMP_PATH" 2>"$STDERR_LOG" | wc -c)
DECOMPRESS_STATUS=$?
UNCOMPRESSED_BYTES=$(printf '%s' "$UNCOMPRESSED_BYTES" | tr -cd '0-9')

# THE MEASUREMENT FAILING AND THE BACKUP BEING SMALL ARE DIFFERENT PROBLEMS, and
# they now say different things. Before, an unmeasurable dump fell through into
# the floor comparison and was reported as "the dump is  bytes uncompressed,
# below the 262144 floor" — a sentence with a hole where the number should be,
# describing a data-loss scenario that had not happened.
if [ "$DECOMPRESS_STATUS" -ne 0 ] || ! is_positive_integer "$UNCOMPRESSED_BYTES"; then
  fail "Could not determine the uncompressed size of the dump. The archive passed \`gzip -t\` but decompressing it to \`wc -c\` produced no usable number, so the size floor below cannot be applied. Nothing was uploaded, because a dump whose size cannot be verified is not a verified dump."
fi

MIN_BYTES="${BACKUP_MIN_UNCOMPRESSED_BYTES:-262144}"
if ! is_positive_integer "$MIN_BYTES"; then
  fail "BACKUP_MIN_UNCOMPRESSED_BYTES is set to '${MIN_BYTES}', which is not a positive whole number of bytes. Unset it to use the 262144 default rather than leaving the size floor undefined."
fi
if [ "$UNCOMPRESSED_BYTES" -lt "$MIN_BYTES" ]; then
  fail "The dump is ${UNCOMPRESSED_BYTES} bytes uncompressed, below the ${MIN_BYTES} floor. Refusing to upload it."
fi

# The three tables whose absence means the dump is of the wrong database or was
# taken by a role that could not read the schema. Clinical data, identity, and
# the trail — if all three are present with their COPY sections, the dump is of
# this application.
#
# `grep -c`, NEVER `grep -q`, and that is a correctness fix rather than a
# portability one. `-q` exits the moment it matches; the gzip upstream of it
# then takes SIGPIPE on its next write and exits 141; and `set -o pipefail`
# (which this script needs, and which is the reason the version failure was
# caught safely) reports the PIPELINE as 141. So `if ! gzip -dc … | grep -q …`
# was true exactly when the table WAS found, on any dump big enough to fill a
# pipe buffer before grep gave up — this job has never completed a run, so it
# had never got this far to find out. `-c` reads to EOF and cannot backfire.
# It exits 1 on a count of zero, hence `|| true`: a zero here is an answer, not
# an error, and the archive has already been through `gzip -t` and a full
# decompression two lines above.
for TABLE in Report ReportResult User; do
  : >"$STDERR_LOG"
  MATCHES=$(gzip -dc "$TMP_PATH" 2>"$STDERR_LOG" | grep -c "^COPY public\.\"${TABLE}\"" || true)
  MATCHES=$(printf '%s' "$MATCHES" | tr -cd '0-9')
  if [ -z "$MATCHES" ] || [ "$MATCHES" -eq 0 ]; then
    fail "The dump contains no data section for \"${TABLE}\". Refusing to upload it."
  fi
done

# SUSPICIOUSLY SMALL, MEASURED AGAINST THIS DATABASE'S OWN HISTORY.
#
# The fixed floor above catches an empty dump. It cannot catch the failure that
# actually happens to a growing database: a dump that is valid, restorable, and
# a third of the size it was last night — a table dropped by a bad migration, a
# permission change that silenced one schema, a --exclude-table left in a
# script. The comparison is against the last SUCCEEDED run's own figure, so the
# threshold moves with the database instead of being a number somebody guessed
# in 2026.
#
# It WARNS AND CONTINUES rather than failing. A smaller dump is still a dump,
# and refusing to upload it would turn a suspicion into a night with no backup
# at all — which is strictly worse. The email is the point.
PREVIOUS_BYTES=$(run psql "$DATABASE_URL" -At -c \
  "SELECT \"uncompressedBytes\" FROM \"BackupRun\" WHERE outcome = 'SUCCEEDED' AND \"uncompressedBytes\" IS NOT NULL ORDER BY \"startedAt\" DESC LIMIT 1" || printf '')
PREVIOUS_BYTES=$(printf '%s' "$PREVIOUS_BYTES" | tr -cd '0-9')
: >"$STDERR_LOG"
SHRINK_PERCENT="${BACKUP_SHRINK_ALERT_PERCENT:-60}"
is_positive_integer "$SHRINK_PERCENT" || SHRINK_PERCENT=60
# No previous run is the ordinary case on the first night and is not a problem;
# an unreadable one is not worth failing a good backup over either, which is why
# this comparison never calls `fail`. The fixed floor above is the check with
# teeth.
if is_positive_integer "$PREVIOUS_BYTES"; then
  THRESHOLD=$(( PREVIOUS_BYTES * SHRINK_PERCENT / 100 ))
  if [ "$UNCOMPRESSED_BYTES" -lt "$THRESHOLD" ]; then
    echo "!! This dump is ${UNCOMPRESSED_BYTES} bytes against ${PREVIOUS_BYTES} last time." >&2
    send_alert \
      "Aspire Bloods: last night's backup is SUSPICIOUSLY SMALL" \
      "The nightly backup completed, and the dump is much smaller than the last successful one.

  this run   ${UNCOMPRESSED_BYTES} bytes uncompressed
  last time  ${PREVIOUS_BYTES} bytes
  threshold  under ${SHRINK_PERCENT}% of the previous run

It WAS uploaded, because a smaller backup is still a backup and refusing it
would leave tonight with none at all. But a database that shrank by this much
overnight has either lost data or stopped being fully readable by the backup
role.

What to check:
  1. Row counts in production against what you expect.
  2. Any migration deployed in the last 24 hours.
  3. Run scripts/restore-drill.sh against this object and read the per-table
     comparison — it prints every table's count against the live database.

See DEPLOYMENT.md -> Database restore."
  fi
fi
echo "Dump verified: ${UNCOMPRESSED_BYTES} bytes uncompressed, schema and data sections present."

SHA256=$(run sha256sum "$TMP_PATH" | awk '{print $1}')
# The round-trip check below compares this against the object read back out of
# R2. An empty hash would compare equal to an empty hash and quietly turn the
# strongest statement this job makes — that the bytes on somebody else's system
# are the bytes that left here — into nothing at all.
SHA_HEX=$(printf '%s' "$SHA256" | tr -cd '0-9a-f')
if [ "${#SHA_HEX}" -ne 64 ] || [ "$SHA_HEX" != "$SHA256" ]; then
  fail "Could not hash the dump before uploading it (\`sha256sum\` produced '${SHA256}'). Without a local hash the upload cannot be checked against what arrives, so it is not being made."
fi

STAGE="UPLOAD"
OBJECT_KEY="$DUMP_FILE"
echo "Uploading to s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}..."
run aws s3 cp "$TMP_PATH" "s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}" --endpoint-url "$BACKUP_S3_ENDPOINT" ||
  fail "The upload to s3://${BACKUP_S3_BUCKET}/${DUMP_FILE} failed."

# READ IT BACK. `aws s3 cp` exiting 0 says the CLI finished, not that the object
# on the other side is the file that left here — and the whole point of an
# off-platform backup is that the other side is somebody else's system. A
# round-trip hash is a few seconds against a database this size and it is the
# difference between "we uploaded something" and "the bytes are there".
STAGE="READBACK"
echo "Reading the object back to check it arrived intact..."
run aws s3 cp "s3://${BACKUP_S3_BUCKET}/${DUMP_FILE}" "${TMP_PATH}.check" --endpoint-url "$BACKUP_S3_ENDPOINT" ||
  fail "The object could not be read back from R2 immediately after uploading it."
REMOTE_SHA=$(run sha256sum "${TMP_PATH}.check" | awk '{print $1}')
rm -f "${TMP_PATH}.check"
if [ "$SHA256" != "$REMOTE_SHA" ]; then
  fail "The uploaded object does not match what was sent (local ${SHA256}, remote ${REMOTE_SHA})."
fi

rm -f "$TMP_PATH"
echo "Uploaded and verified $DUMP_FILE (sha256 ${SHA256})"

# ---------------------------------------------------------------------------
# PRUNE. Deliberately AFTER the run has been recorded as good in every other
# respect, and deliberately not fatal: deleting an expired object failing is
# a housekeeping problem, and treating it as a failed backup would page
# somebody at 3am about disk usage while a perfectly good backup sits in the
# bucket.
# ---------------------------------------------------------------------------
STAGE="PRUNE"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"
is_positive_integer "$RETENTION_DAYS" || RETENTION_DAYS=35
echo "Pruning backups older than ${RETENTION_DAYS} days..."
# busybox date (this image's base) doesn't understand GNU's "N days ago"
# syntax — epoch arithmetic works on both, and `-d @EPOCH` has been in BusyBox
# since 1.21.
#
# IT IS STILL VALIDATED RATHER THAN TRUSTED, because this is the one stage that
# DELETES. An empty or malformed cutoff compares as smaller than every date in
# the listing, so nothing would be deleted — safe by accident today, and one
# reversed comparison away from deleting the entire bucket. So the shape is
# checked, and a cutoff that cannot be computed skips the prune with a warning:
# a bucket that keeps too much for a night is a housekeeping problem, and one
# that deletes on a date nobody could parse is the backup gone.
NOW_EPOCH=$(run date -u +%s | tr -cd '0-9')
CUTOFF=""
if is_positive_integer "$NOW_EPOCH"; then
  CUTOFF=$(run date -u -d "@$(( NOW_EPOCH - RETENTION_DAYS * 86400 ))" +%Y-%m-%d || printf '')
fi
case "$CUTOFF" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) CUTOFF="" ;;
esac
: >"$STDERR_LOG"

if [ -z "$CUTOFF" ]; then
  echo "!! Could not compute the retention cutoff date, so nothing was pruned. The backup itself is uploaded and verified." >&2
else
  aws s3 ls "s3://${BACKUP_S3_BUCKET}/" --endpoint-url "$BACKUP_S3_ENDPOINT" | while read -r line; do
    FILE_DATE=$(printf '%s' "$line" | awk '{print $1}')
    FILE_NAME=$(printf '%s' "$line" | awk '{print $4}')
    # Both sides are YYYY-MM-DD, so a lexical comparison is a chronological one.
    # The date has to LOOK like one before it is compared: a listing line this
    # script does not understand must never be read as "older than the cutoff".
    case "$FILE_DATE" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
      *) continue ;;
    esac
    if [[ -n "$FILE_NAME" && "$FILE_DATE" < "$CUTOFF" ]]; then
      echo "Deleting expired backup: $FILE_NAME"
      aws s3 rm "s3://${BACKUP_S3_BUCKET}/${FILE_NAME}" --endpoint-url "$BACKUP_S3_ENDPOINT" ||
        echo "!! Could not delete ${FILE_NAME}. Not treating this as a failed backup." >&2
    fi
  done
fi

record_run 'SUCCEEDED'
echo "Backup job complete."
