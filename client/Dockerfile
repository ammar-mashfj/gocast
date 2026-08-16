# Multi-stage build: one Dockerfile, two runnable images.
#
#   dev   → `npm run dev` with source-tree bind mount for hot reload
#   prod  → `next start` from the standalone build output (no source tree,
#           no dev deps, ~30 MB of runtime code instead of ~600 MB)
#
# Select at build time:
#   docker compose build --target dev client     (default via docker-compose.yml)
#   docker compose -f docker-compose.prod.yml build client  (prod override)

# Node is pinned to an exact patch + Alpine pair rather than `node:20-alpine`,
# which moves with every minor release. All four stages must stay on the same
# tag or the deps layer stops being shared and npm ci runs more than once.
#
# --------------------------------------------------------------------
# Shared deps layer — both dev and prod reuse this so npm ci runs once.
# --------------------------------------------------------------------
FROM node:20.20.2-alpine3.23 AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --------------------------------------------------------------------
# Dev target — what local compose uses. Source is bind-mounted from the
# host so edits hot-reload; the COPY is only there so a standalone
# `docker build --target dev && docker run` still produces something
# runnable without a bind mount.
# --------------------------------------------------------------------
FROM node:20.20.2-alpine3.23 AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --------------------------------------------------------------------
# Builder — produces the standalone output for the prod image. Kept
# separate from `prod` so build tools (swc, etc.) don't ship to runtime.
#
# NEXT_PUBLIC_* values are inlined into the client bundle at build time —
# they MUST be passed as --build-arg, not as runtime env. Setting them on
# the running container does nothing because the strings are already
# hardcoded in the emitted JavaScript.
# --------------------------------------------------------------------
FROM node:20.20.2-alpine3.23 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ICECAST_URL
ARG NEXT_PUBLIC_WHIP_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_ICECAST_URL=${NEXT_PUBLIC_ICECAST_URL}
ENV NEXT_PUBLIC_WHIP_URL=${NEXT_PUBLIC_WHIP_URL}

# Sentry — NEXT_PUBLIC_SENTRY_DSN is inlined into the browser bundle the
# same way as the other NEXT_PUBLIC_* vars. SENTRY_AUTH_TOKEN is used by
# @sentry/nextjs's webpack plugin during build to upload source maps to
# Sentry so stack traces in the dashboard resolve to real file/line
# locations. Without it the release still works, just with minified traces.
# Safe to leave blank in local dev — the Sentry plugin skips upload gracefully.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --------------------------------------------------------------------
# Prod target — minimal runtime image. Copies only what next's
# output: "standalone" emits (a self-contained server.js + minimal
# node_modules) plus the public/ and static/ folders that aren't
# bundled into standalone.
# --------------------------------------------------------------------
FROM node:20.20.2-alpine3.23 AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for runtime — best practice, and prevents accidental
# writes to bind-mounted host dirs if someone wires them in.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs
USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
