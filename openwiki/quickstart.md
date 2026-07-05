# CareerOps — OpenWiki Quickstart

Welcome to CareerOps, an AI-powered job-search pipeline that automates repetitive parts of a focused job search. This guide explains what the project does, how it's organized, and where to go next.

## What is CareerOps?

CareerOps helps you manage a structured job search by automating four core workflows:

1. **Scan** — Discover relevant roles across job boards, company portals, and APIs (Greenhouse, Ashby, Lever, or Playwright browser fallback)
2. **Evaluate** — Fetch each job description and run a structured A–F evaluation through an LLM (OpenAI-compatible), storing scored reports in MinIO
3. **PDF** — Render a personalized, ATS-parseable CV from an HTML template
4. **Track** — Manage applications in Postgres; view and edit the pipeline through the CLI or Next.js web dashboard

All data lives in **Postgres** (applications, companies, filter keywords) and **MinIO** (evaluation reports), with optional DynamoDB storage for CV and profile information.

---

## Repository Structure at a Glance

```
CareerOps/
├── src/                 Core CLI and library code (TypeScript)
│   ├── cli/            Executable entrypoints: scan, evaluate, pdf, tracker, portals
│   └── lib/            Pure, unit-tested building blocks
│
├── web/                Next.js web dashboard (App Router, Tailwind, shadcn UI)
│   ├── app/api/        REST routes: /api/applications, /api/metrics, /api/pipeline, /api/profile, etc.
│   ├── components/     Reusable React components: dashboard, report viewer, pipeline runner
│   └── lib/            Server utilities: tracker integration, reporting, auth
│
├── prisma/             Database schema (User, Application, Portal, FilterKeyword, etc.)
├── tests/              Vitest unit and e2e tests
├── scripts/            Utility scripts: backfill, migrate, validation
├── docker-compose.yml  Local development services: Postgres, MinIO, DynamoDB
│
├── modes/              Claude Code workflow files (scan.md, evaluate.md, etc.)
├── .github/            GitHub Copilot agents, prompts, instructions
└── docs/               Legacy architecture docs (consider linking from openwiki instead)
```

---

## Getting Started

### 1. Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in: OPENCODE_API_KEY or NVIDIA_API_KEY, auth provider secrets (optional for CLI-only usage)

# Start local services
docker compose up -d  # Postgres, MinIO, DynamoDB

# Run migrations
npm run db:migrate:multitenant  # If this is the first time
```

### 2. Configure Scan Targets

Add companies (job board portals) to Postgres:

```bash
# List current portals
npm run portals -- list

# Add a new portal
npm run portals -- add --name "Acme Corp" --url "https://jobs.acme.com"

# Add title-filter keywords (required for scanning)
npm run portals -- keywords add --kind positive --value "software engineer"
npm run portals -- keywords add --kind negative --value "sales engineer"
```

### 3. Run the Pipeline

```bash
# Scan for new roles (reads companies from Postgres)
npm run scan

# Evaluate pending N/A roles (uses LLM)
npm run evaluate

# Generate ATS-friendly PDF
npm run pdf -- templates/cv-template.html output.pdf

# Track applications (view/update in Postgres)
npm run tracker -- list
npm run tracker -- update --num <uuid> --status Applied
```

### 4. Browse the Web Dashboard

```bash
cd web
npm install
npm run dev  # http://localhost:3000

# Log in with your OAuth provider (Google, GitHub, etc.)
```

---

## Key Concepts

### **Application Status Flow**

An application moves through these states (defined in `prisma/schema.prisma`):

- **Evaluated** — Job description scored by LLM, report stored in MinIO
- **Applied** — You've submitted an application
- **Responded** — Company has acknowledged (screen, take-home, etc.)
- **Interview** — Active interview process
- **Offer** — You have an offer
- **Rejected** — Company rejected you
- **Discarded** — You decided not to pursue
- **SKIP** — Marked to skip (not relevant)

### **Multi-User Model**

The system supports multiple users (via NextAuth):

- **CLI pipelines** run under a configured user (set by `CAREER_OPS_USER_EMAIL`)
- **Web dashboard** injects the signed-in user automatically
- All applications, keywords, and reports are scoped to a `userId`

### **Data Integrity**

- Applications are unique by `(userId, url)` — duplicate URLs within a user are prevented by unique index
- Scan results are deduplicated during insertion (checked at DB write time)
- Reports are stored in MinIO with a naming convention: `{###}-{company-slug}-{YYYY-MM-DD}.md`

---

## Major Sections

### [Architecture](./architecture/overview.md)

Understanding how the system fits together:
- System overview diagram
- Data flow (CV, profiles, portals, evaluations → Postgres + MinIO)
- Key dependencies and integrations

### [Workflows](./workflows/overview.md)

Step-by-step guides for core operations:
- [Scan workflow](./workflows/scan.md) — Job board discovery and deduplication
- [Evaluate workflow](./workflows/evaluate.md) — LLM-powered job assessment
- [Track workflow](./workflows/track.md) — Application status management

### [Web Dashboard](./web-dashboard/overview.md)

Next.js app for browsing and managing applications:
- [Authentication](./web-dashboard/auth.md) — NextAuth v5 OAuth integration
- [REST API](./web-dashboard/api.md) — Endpoints for applications, metrics, reports, pipeline
- [Components](./web-dashboard/components.md) — Dashboard, report viewer, pipeline runner

### [Storage & Data Models](./storage/overview.md)

How data is organized and persisted:
- [Database schema](./storage/schema.md) — Postgres tables and relationships
- [MinIO integration](./storage/minio.md) — Report storage and retrieval
- [DynamoDB](./storage/dynamodb.md) — CV and profile storage

### [Operations & Maintenance](./operations/overview.md)

Scripts, debugging, and keeping the system healthy:
- [CLI reference](./operations/cli.md) — Command catalog
- [Database maintenance](./operations/maintenance.md) — Backfills, migrations, validation
- [Troubleshooting](./operations/troubleshooting.md) — Common issues and fixes

### [Testing](./testing/overview.md)

How to run tests and write new ones:
- Test setup and configuration
- Unit test examples
- E2E test fixtures

---

## Common Tasks

### I want to scan for new jobs
→ See [Scan workflow](./workflows/scan.md)

### I want to evaluate jobs with an LLM
→ See [Evaluate workflow](./workflows/evaluate.md)

### I want to see or edit my applications
→ See [Web Dashboard](./web-dashboard/overview.md)

### I want to understand the code structure
→ See [Architecture](./architecture/overview.md)

### I want to add a new company portal
```bash
npm run portals -- add --name "Company X" --url "https://jobs.company-x.com"
```

### I want to customize the evaluation criteria
→ See [Evaluate workflow](./workflows/evaluate.md) and `/src/lib/prompt.ts`

### I want to troubleshoot a failed scan or evaluation
→ See [Troubleshooting](./operations/troubleshooting.md)

---

## Development

### Local environment

```bash
# Install all dependencies (root + web)
npm install && cd web && npm install && cd ..

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm run test          # Unit tests
npm run test:watch    # Watch mode
npm run test:e2e      # E2E tests
```

### Making changes

1. Identify the domain: CLI logic (`src/cli/`), libraries (`src/lib/`), web (`web/`), or database (`prisma/`)
2. Check related tests in `/tests`
3. Follow the [Architecture](./architecture/overview.md) guide to understand data flow
4. Run `npm run check` to type-check, lint, and test before committing

---

## Integration with AI Tools

### Claude Code

CareerOps includes mode files in `/modes/` (e.g., `scan.md`, `evaluate.md`) that provide Claude with workflow guidance. Run:

```bash
claude -p < modes/scan.md
```

### GitHub Copilot

Agent files in `/.github/agents/` and prompts in `/.github/prompts/` guide Copilot through common workflows. See `/.github/copilot-instructions.md` for setup.

---

## Key Files and Where to Look

| Goal | File(s) |
|------|---------|
| Understand data model | `prisma/schema.prisma` |
| Add a new CLI command | `src/cli/` + `src/lib/` |
| Modify web UI | `web/components/` + `web/app/` |
| Change auth behavior | `web/auth.config.ts` + `web/middleware.ts` |
| Write a test | `tests/*.test.ts` |
| Understand job evaluation | `src/lib/prompt.ts`, `src/lib/llm.ts` |
| Understand job scanning | `src/lib/scanner.ts`, `src/cli/scan.ts` |
| Manage storage (MinIO) | `src/lib/minio.ts` |

---

## Environment Variables

**Required for CLI pipelines:**
- `DATABASE_URL` — Postgres connection string
- `NVIDIA_API_KEY` or `OPENCODE_API_KEY` — LLM provider credentials
- `CAREER_OPS_USER_EMAIL` — User email (for CLI ownership)

**Required for web dashboard:**
- All CLI vars, plus:
- `AUTH_SECRET` — NextAuth secret
- `AUTH_URL` — Dashboard base URL (e.g., `http://localhost:3000`)
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — OAuth provider (optional, but recommended)

**Storage services:**
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` — MinIO S3 storage
- `DYNAMODB_ENDPOINT`, `DYNAMODB_REGION`, `DYNAMODB_TABLE_CV`, `DYNAMODB_TABLE_PROFILE` — DynamoDB

See `.env.example` for all options and defaults.

---

## Troubleshooting & Support

- **Scan fails with "No positive keywords"** → Add title-filter keywords: `npm run portals -- keywords add --kind positive --value "..."`
- **LLM evaluation fails** → Check `OPENCODE_API_KEY` or `NVIDIA_API_KEY` is set and valid
- **Web dashboard won't start** → Ensure `cd web && npm install` was run; check `AUTH_SECRET` and `DATABASE_URL`
- **Docker services won't start** → Run `docker compose down && docker compose up -d` to reset

See [Troubleshooting](./operations/troubleshooting.md) for more help.

---

## Next Steps

1. **First time?** Follow the [Getting Started](#getting-started) section
2. **Want to scan?** Go to [Scan workflow](./workflows/scan.md)
3. **Want to evaluate?** Go to [Evaluate workflow](./workflows/evaluate.md)
4. **Want to understand the code?** Go to [Architecture](./architecture/overview.md)
5. **Working on the codebase?** See [Development](#development) and relevant section pages

---

## Contributing

See the main [README.md](/README.md) for licensing and contribution guidelines. Improvements to CareerOps (new scanner backends, better LLM prompts, additional web features) are welcome.

## License

MIT (see [LICENSE](../LICENSE))
