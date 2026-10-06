# ─────────────────────────────────────────────────────────────────────────────
# CareerOps pipeline image.
# Only Chromium is used (scanner, JD fetcher, PDF renderer) — installed via the
# Playwright CLI instead of the official multi-browser Playwright base image,
# which also bundles Firefox/WebKit we never launch. The CLI always installs
# whatever version matches the "playwright" package resolved from
# package-lock.json, so there's no base-image tag to keep in sync by hand.
# ─────────────────────────────────────────────────────────────────────────────
# ── Init stage (dynamo-init service — no Playwright/Prisma needed) ───────────
FROM node:22-alpine AS init

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts

ENTRYPOINT ["npm"]
CMD ["run", "dynamo:init"]

# ─────────────────────────────────────────────────────────────────────────────
# Build doesn't launch a browser, so it doesn't need Playwright at all.
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# Build Next.js web app
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --ignore-scripts && rm -rf node_modules/@prisma/client node_modules/.prisma
COPY web ./web
RUN cd web && npm run build && rm -rf .next/cache

# ── Dev ──────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS dev

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npx playwright install --with-deps chromium
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --ignore-scripts && rm -rf node_modules/@prisma/client node_modules/.prisma

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# curl is what the ECS container health check runs (deploy/terraform/ecs.tf).
# The Playwright base image shipped it; node:*-slim does not, and
# `playwright install --with-deps` doesn't pull it in either.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Install root production dependencies
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts \
  && npx playwright install --with-deps chromium \
  && npm cache clean --force

# Generate Prisma client (also run by postinstall, but explicit for clarity)
RUN npx prisma generate

# Copy CLI dist
COPY --from=build /app/dist ./dist
COPY fonts ./fonts
COPY templates ./templates

# Copy Web App — .next/cache is build-only tooling cache, never needed at
# runtime, so it's dropped in the build stage before either copy below.
COPY --from=build /app/web/.next ./web/.next

# Production-only web dependencies (build stage's node_modules also carries
# devDependencies like typescript/eslint/tailwindcss, which the runtime never
# needs — mirrors the root install above rather than copying that install).
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --omit=dev --ignore-scripts \
  && rm -rf node_modules/@prisma/client node_modules/.prisma \
  && npm cache clean --force

# Expose Next.js port
EXPOSE 3000

# Start the Next.js web app by default
ENTRYPOINT ["npm"]
CMD ["start", "--prefix", "web"]
