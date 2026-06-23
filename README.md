# CarrerOps

> AI-powered job-search pipeline: scan job boards, evaluate roles against your CV with an LLM, generate ATS-friendly PDFs, and track everything in Postgres with reports stored in Nextcloud.

CarrerOps automates the repetitive parts of a focused job search:

1. **Scan** — discover relevant roles across the companies stored in Postgres (Greenhouse / Ashby / Lever APIs, with a Playwright browser fallback).
2. **Evaluate** — fetch each job description and run a structured A–F evaluation through an OpenAI-compatible LLM, storing a scored report per role in Nextcloud.
3. **PDF** — render a personalized, ATS-parseable CV from an HTML template.
4. **Track** — applications live in Postgres; manage the pipeline through the `tracker` CLI **or** the web dashboard (Next.js).

---

## Requirements

- **Node.js >= 20** (developed on Node 22)
- **PostgreSQL** (applications store) and **Nextcloud** (report storage) — both provided by `docker compose up`
- Playwright's Chromium (installed automatically with the `playwright` dependency; run `npx playwright install chromium` if missing)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   then fill in OPENCODE_API_KEY and/or NVIDIA_API_KEY

# 3. Provide your data (git-ignored)
#   - cv.md                  your canonical CV
#   - config/profile.yml     target roles, comp, location
#   Scan targets live in Postgres — manage with: npm run portals
```

## Usage

All commands run via `npm run <script>` (powered by [`tsx`](https://github.com/privatenumber/tsx), no build step needed):

| Command | Description |
|---|---|
| `npm run portals -- list\|add\|update\|delete` | Manage scan targets in Postgres (the single source of truth). |
| `npm run scan` | Scan structured job-board APIs (companies read from Postgres) and add shortlisted roles to Postgres. |
| `npm run scan:fallback` | Scan + Playwright browser fallback for non-API boards. |
| `npm run evaluate` | Evaluate up to 5 pending `N/A` jobs via the LLM. |
| `npm run evaluate:all` | Evaluate up to 50 pending jobs. |
| `npm run evaluate:dry` | Fetch JDs only — skip the AI call and any writes. |
| `npm run pdf -- <in.html> <out.pdf> [--format=a4\|letter]` | Render an HTML CV to PDF. |
| `npm run tracker -- list\|add\|update\|save` | Read/write applications in Postgres and reports in Nextcloud. |

### Typical flow

```bash
docker compose up -d      # start Postgres + Nextcloud
npm run portals -- migrate # seed scan targets into Postgres (from portals.yml)
npm run scan:fallback     # discover roles → adds shortlist to Postgres
npm run evaluate:all      # score pending roles → reports to Nextcloud, rows to Postgres
cd web && npm run dev      # browse the pipeline (web UI at http://localhost:3000)
```

### LLM providers

`evaluate` resolves a provider by name (`--provider`), checking built-ins first
and then any custom providers in `~/.config/opencode/opencode.jsonc`.

| Provider | Base URL | Default model | Auth env var |
|---|---|---|---|
| `nvidia` (default) | `https://integrate.api.nvidia.com/v1` | `openai/gpt-oss-120b` | `NVIDIA_API_KEY` |
| `zen` | `https://opencode.ai/zen/v1` | `deepseek-v4-flash-free` | `OPENCODE_API_KEY` |

Override at runtime:

```bash
npm run evaluate -- --provider zen --model deepseek-v4-flash-free --limit 10
```

You can also set defaults via `CAREER_OPS_PROVIDER` / `CAREER_OPS_MODEL` in `.env`.

## Project structure

```
src/
  cli/              Executable entrypoints (thin orchestration)
    scan.ts         Job-board scanner (reads targets from Postgres)
    evaluate.ts     LLM evaluation agent
    pdf.ts          HTML → PDF renderer
    tracker.ts      Persist applications (Postgres) + reports (Nextcloud)
    portals.ts      Migrate/list scan targets in Postgres
  lib/              Pure, unit-tested building blocks
    args.ts         Argv parsing
    concurrency.ts  mapLimit + semaphore
    db.ts           Prisma/Postgres client
    env.ts          .env loading + requireEnv
    jd.ts           Job-description extraction
    llm.ts          Provider resolution + chat completion
    logger.ts       Leveled console logging
    matching.ts     Title/engineering/location/high-signal filters
    nextcloud.ts    Report upload via WebDAV
    paths.ts        Centralized project paths
    pdf.ts          Chromium PDF rendering
    portals-db.ts   Postgres-backed scan config (loadConfigFromDb)
    prompt.ts       Evaluation prompt + score parsing
    scanner.ts      Greenhouse/Ashby/Lever + browser scraping
    text.ts         String helpers (slugify, dedup keys, ...)
    tracker.ts      Postgres reads/writes + Nextcloud report writing
  types.ts          Shared domain types
tests/              Vitest unit tests
web/                Next.js web dashboard (App Router + Tailwind + shadcn-style UI)
  app/api/          REST route handlers (applications, metrics, reports, pipeline)
  app/              Pages + layout
  components/       Dashboard, table, metrics, report viewer, pipeline runner, UI primitives
  lib/              Server utilities: tracker parse/update, reports, metrics, status, paths
```

## Web dashboard

A Next.js dashboard lives in `web/`. It reads applications from Postgres and
reports from Nextcloud through a small REST API, so it stays in sync with the CLI.

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Features:

- **Metrics** — totals, average/top score, PDF coverage, counts by status.
- **Applications table** — status tabs, sortable (score/date/company/status), grouped view.
- **Status editing** — change an application's status inline (writes back to Postgres).
- **Report viewer** — rendered markdown of the full A–F evaluation, with a link to the job posting.
- **Pipeline runner** — trigger `scan` / `evaluate` from the UI and stream live logs.

### REST API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/applications` | All applications, enriched from report headers. |
| `PATCH` | `/api/applications` | Update a row's status (`{ num, reportNumber, newStatus }`). |
| `GET` | `/api/metrics` | Aggregate pipeline metrics. |
| `GET` | `/api/reports/:num` | Full report markdown + header for a report number. |
| `POST` | `/api/pipeline/:command` | Run `scan` / `scan:fallback` / `evaluate[:all|:dry]`, streaming output. |

The repo root is auto-detected (override with `CAREER_OPS_ROOT`). Pipeline routes
spawn the root `npm run <command>` scripts, so run the web app from within the
repository.

## Development

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint (flat config)
npm run format        # Prettier --write
npm run test          # Vitest
npm run test:coverage # Vitest + v8 coverage
npm run check         # typecheck + lint + test
npm run build         # compile to dist/
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs format-check, lint,
typecheck, tests with coverage, and the build for both the Node pipeline and the
Next.js web dashboard on every push/PR.

## Docker

The image is based on the official Playwright image so Chromium and its system
dependencies are preinstalled.

```bash
docker build -t career-ops .

# Run the scanner against your local working tree (mount it as a volume)
docker run --rm --env-file .env -v "$PWD:/work" -w /work \
  career-ops node /app/dist/cli/scan.js --compact
```

## Data & privacy

Personal data is **git-ignored** by design (`cv.md`, `config/profile.yml`,
`data/*`, `output/*`). Applications and scan targets live in Postgres; reports
live in Nextcloud — none of this is in the repo. Secrets live only in `.env`
(also git-ignored); never commit real API keys — see `.env.example`.

## License

MIT
