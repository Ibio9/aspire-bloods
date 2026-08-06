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
# prisma/seed.ts (run at every boot — see "start" below) imports from
# ../src/lib and ../src/db with relative paths, and is executed via tsx
# rather than compiled, so the TS source it imports has to exist here too —
# only dist/ was copied before, which made `tsx prisma/seed.ts` fail at
# container startup with ERR_MODULE_NOT_FOUND on every one of those
# imports. tsx itself doesn't need a separate copy: `npm ci` in the build
# stage installs devDependencies (nothing here sets NODE_ENV=production
# until the runtime stage below), and the whole node_modules directory is
# copied wholesale two lines up, so it's already present.
COPY --from=build /app/apps/server/src ./apps/server/src
# Randox void/caveat code map and panel/test id map, read at boot by
# modules/randox/config.ts relative to the workspace cwd — without them the
# integration refuses to start. Only the .example placeholders are baked in;
# the real files are supplied by pointing RANDOX_CODE_MAP_FILE and
# RANDOX_ID_MAP_FILE at a mounted volume (a live boot still pointing at an
# .example path is refused — see assertRandoxConfigured).
COPY --from=build /app/apps/server/config ./apps/server/config
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4000
CMD ["npm", "run", "start", "--workspace=apps/server"]
