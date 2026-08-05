# Standalone image for the Railway Cron Service that runs the nightly
# backup — deliberately not the app's own Dockerfile: this needs pg_dump
# and the AWS CLI, not Node/npm/Prisma. Based on postgres:16-alpine so
# pg_dump's version matches our Postgres (see docker-compose.yml) — if
# Railway ever provisions a different major version, bump this to match.
FROM postgres:16-alpine

RUN apk add --no-cache bash python3 py3-pip && \
    pip install --no-cache-dir --break-system-packages awscli

COPY apps/server/scripts/backup.sh /backup.sh
RUN chmod +x /backup.sh

CMD ["/backup.sh"]
