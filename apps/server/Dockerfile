# Built with repo root as the Docker build context (see railway.json) —
# apps/server depends on packages/shared via an npm workspace, which only
# resolves correctly when npm ci runs from the workspace root.
FROM node:20-slim AS build
WORKDIR /app

# Prisma's query engine needs OpenSSL and node:20-slim doesn't include it —
# without this, prisma generate falls back to guessing the OpenSSL version
# ("openssl-1.1.x") and the resulting engine binary may not actually match
# what's on the runtime image.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Only the manifests first, so this layer caches until a dependency
# actually changes rather than on every source edit.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/

# Scoped to exactly what apps/server needs — apps/web is never installed
# here at all (it deploys separately, to Vercel). This is the one and
# only install step; nothing upstream of this also installs.
RUN npm ci --workspace=packages/shared --workspace=apps/server --include-workspace-root

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/

RUN npm run build --workspace=packages/shared \
 && npm run prisma:generate --workspace=apps/server \
 && npm run build --workspace=apps/server

# --- Runtime image: only what's needed to run the compiled server ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `prisma migrate deploy` runs at container startup (see apps/server's
# "start" script), not just at build time — the query engine needs
# OpenSSL present here too, not only in the build stage.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4000
CMD ["npm", "run", "start", "--workspace=apps/server"]
