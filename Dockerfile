# Production image for Railway (or any container host).
# Builds the web bundle and serves it from the Hono API (SERVE_STATIC=1) on $PORT.
FROM oven/bun:1.4.2 AS build
WORKDIR /app

# Install with the lockfile first so dependency layers cache well.
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY tools/dev/package.json tools/dev/
COPY scripts/require-bun.ts scripts/
RUN bun install --frozen-lockfile

COPY . .
# Public build-time configuration (never secrets). Railway passes these as build args
# when they are defined as service variables.
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ARG VITE_API_ORIGIN=""
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN bun run build

FROM oven/bun:1.4.2-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production SERVE_STATIC=1
COPY --from=build --chown=bun:bun /app /app
# Run as the unprivileged `bun` user (uid 1000) that ships with the base image; the app writes nothing to disk.
USER bun
EXPOSE 3000
# Migrations run as Railway's pre-deploy command (see railway.json). AUTO_MIGRATE=1 is a fallback for other hosts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "apps/api/src/index.ts"]
