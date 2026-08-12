# Standalone image for the Railway Cron Service that runs the nightly
# backup — deliberately not the app's own Dockerfile: this needs pg_dump
# and the AWS CLI, not Node/npm/Prisma. Based on postgres:16-alpine so
# pg_dump's version matches our Postgres (see docker-compose.yml) — if
# Railway ever provisions a different major version, bump this to match.
FROM postgres:16-alpine

# curl and python3 are for the FAILURE ALERT, not for the backup: the script
# posts to Resend over curl and builds the JSON with python3, because this image
# is postgres:16-alpine plus the AWS CLI and has no Node runtime to reuse the
# app's own email provider with. Hand-rolling JSON escaping around a psql error
# message is how an alert becomes a 400 on the night it is needed.
RUN apk add --no-cache bash curl python3 py3-pip && \
    pip install --no-cache-dir --break-system-packages awscli

COPY apps/server/scripts/backup.sh /backup.sh
RUN chmod +x /backup.sh

CMD ["/backup.sh"]
