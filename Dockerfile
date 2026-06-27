# ─────────────────────────────────────────────────────────────────────────────
# CarrerOps pipeline image.
# Based on the official Playwright image so Chromium + its system deps are
# already present (used by the scanner, JD fetcher, and PDF renderer).
# Keep the version in sync with the "playwright" dependency in package.json.
# ─────────────────────────────────────────────────────────────────────────────
# ── Init stage (dynamo-init service — no Playwright/Prisma needed) ───────────
FROM node:22-alpine AS init

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

ENTRYPOINT ["npm"]
CMD ["run", "dynamo:init"]

# ─────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS build

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
RUN cd web && npm ci --ignore-scripts
COPY web ./web
RUN cd web && npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Install root production dependencies
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Generate Prisma client (also run by postinstall, but explicit for clarity)
RUN npx prisma generate

# Copy CLI dist
COPY --from=build /app/dist ./dist
COPY fonts ./fonts
COPY templates ./templates

# Copy Web App
COPY --from=build /app/web/.next ./web/.next
COPY --from=build /app/web/package.json ./web/package.json
COPY --from=build /app/web/node_modules ./web/node_modules

# Expose Next.js port
EXPOSE 3000

# Start the Next.js web app by default
ENTRYPOINT ["npm"]
CMD ["start", "--prefix", "web"]
