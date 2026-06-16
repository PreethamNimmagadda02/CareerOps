# ─────────────────────────────────────────────────────────────────────────────
# CarrerOps pipeline image.
# Based on the official Playwright image so Chromium + its system deps are
# already present (used by the scanner, JD fetcher, and PDF renderer).
# Keep the version in sync with the "playwright" dependency in package.json.
# ─────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY fonts ./fonts
COPY templates ./templates

# Runtime data (portals.yml, cv.md, config/, data/, reports/) should be mounted
# as a volume, e.g.:
#   docker run --rm -v "$PWD:/work" -w /work career-ops node /app/dist/cli/scan.js --compact
ENTRYPOINT ["node"]
CMD ["dist/cli/scan.js", "--compact"]
