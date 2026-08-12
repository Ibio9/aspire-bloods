# Standalone image for the Railway Cron Service that runs the nightly
# backup — deliberately not the app's own Dockerfile: this needs pg_dump
# and the AWS CLI, not Node/npm/Prisma.
#
# ── THE CLIENT MAJOR VERSION MUST BE >= THE SERVER'S ───────────────────────
#
# pg_dump REFUSES to dump a server newer than itself. It is not a warning and
# there is no flag for it:
#
#   pg_dump: error: aborting because of server version mismatch
#   pg_dump: detail: server version: 18.4; pg_dump version: 16.14
#
# That is what happened on the first real run of this job (12 August 2026).
# This was pinned at 16 to match docker-compose.yml — which is the LOCAL
# database and is not what this container dumps. It dumps Railway's Postgres,
# which is 18.4, and the two are free to diverge. So the pin follows the
# SERVER, and local development is irrelevant to it.
#
# A comment saying "bump this if Railway upgrades" is what was here before and
# it did not survive contact with a Railway upgrade nobody was told about, so
# backup.sh now READS both versions at the start of every run and fails with
# both numbers named. When that alert arrives, bump this tag.
#
# Newer than the server is fine and is the intended direction: pg_dump supports
# servers back to 9.2, so a client ahead of the server costs nothing and a
# client behind it costs the backup.
FROM postgres:18-alpine

# curl and python3 are for the FAILURE ALERT, not for the backup: the script
# posts to Resend over curl and builds the JSON with python3, because this image
# is postgres:18-alpine plus the AWS CLI and has no Node runtime to reuse the
# app's own email provider with. Hand-rolling JSON escaping around a psql error
# message is how an alert becomes a 400 on the night it is needed.
RUN apk add --no-cache bash curl python3 py3-pip && \
    pip install --no-cache-dir --break-system-packages awscli

COPY apps/server/scripts/backup.sh /backup.sh
RUN chmod +x /backup.sh

CMD ["/backup.sh"]
