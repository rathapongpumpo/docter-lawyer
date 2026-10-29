# Production image of the web tier (Next.js standalone). Build: docker compose -f deploy/docker-compose.yml build web
# Secrets are read at run time (env), never at build time; APP_BUILD / APP_VERSION are passed as build args for /api/healthz.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Placeholders so route modules that read settings while `next build` imports them do not fail; this stage is not shipped.
ENV BETTER_AUTH_SECRET=build-only-placeholder APP_URL=http://localhost DB_NAME=build DB_WEB_PASSWORD=build AI_SERVICE_URL=http://localhost AI_SERVICE_TOKEN=build
RUN pnpm run build

FROM node:22-slim AS run
ARG APP_BUILD=dev
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_BUILD=$APP_BUILD APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# user manual content (read at run time by lib/manual.ts)
COPY --from=build --chown=node:node /app/content ./content
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
