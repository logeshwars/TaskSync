# =============================================================================
# Multi-stage Dockerfile for the TaskSync backend.
#
# Stages:
#   base         shared OS layer pinned to a specific Node version
#   dependencies installs prod + dev deps (cached unless package*.json change)
#   development  full dev stack with watch mode (compose `target: development`)
#   build        compiles TS -> JS into /dist, then prunes dev deps
#   production   minimal final image, only prod deps + compiled output
#
# Senior rationale:
#   - Multi-stage keeps the final image small AND fast to rebuild during dev.
#     A naive single-stage Dockerfile rebuilds everything on every code edit.
#   - We pin the major Node version (`20-alpine`) but let patch versions float
#     so we pick up CVE fixes automatically.
#   - The production stage runs as the unprivileged `node` user — never run
#     a Node container as root in production.
#   - tini is the entrypoint so SIGTERM is forwarded properly to the Node
#     process; without it, `docker stop` waits the full 10s grace period.
# =============================================================================

# ---- base -------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# ---- dependencies -----------------------------------------------------------
FROM base AS dependencies
# Copy lockfile separately so the install layer caches when only source changes.
COPY package.json package-lock.json* ./
# `npm ci` is reproducible (errors on drift); fall back to `install` for the
# very first build before a lockfile exists.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- development ------------------------------------------------------------
FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---- build ------------------------------------------------------------------
FROM dependencies AS build
COPY . .
RUN npm run build
# Strip dev deps so they aren't carried into the production stage.
RUN npm prune --omit=dev

# ---- production -------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist          ./dist
COPY --from=build /usr/src/app/package.json  ./package.json
# Drop privileges. The `node` user ships with the official image.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
