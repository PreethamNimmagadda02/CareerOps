# CLI Commands Reference

Complete reference for all CareerOps CLI commands.

## Core Pipeline Commands

### npm run scan
Discover jobs across configured company portals (API-based only).

```bash
npm run scan \
  --compact              # Compact logging (fewer details)
  --verbose              # Verbose logging (more details)
  --concurrency 12       # Max parallel API calls (default 12)
```

**Output:** New jobs added to Postgres (status=N/A)

**See:** [Scan Workflow](../workflows/scan.md)

### npm run scan:fallback
Discover jobs with Playwright browser fallback for non-API portals.

```bash
npm run scan:fallback \
  --concurrency 12       # Max parallel API calls (default 12)
  --browser-concurrency 8 # Max parallel browser instances (default 8)
```

**Output:** New jobs added to Postgres (status=N/A)

**See:** [Scan Workflow](../workflows/scan.md)

### npm run evaluate
Evaluate up to 5 pending N/A jobs with LLM.

```bash
npm run evaluate \
  --limit 5              # Max jobs to evaluate (default 5)
  --job <uuid>           # Evaluate specific job
  --provider nvidia      # LLM provider (default: nvidia)
  --model deepseek-v3    # Model name
  --dry-run              # Fetch JDs only, skip LLM
  --concurrency 8        # Parallel LLM calls (default 8)
```

**Output:** Evaluated jobs in Postgres, reports in MinIO

**See:** [Evaluate Workflow](../workflows/evaluate.md)

### npm run evaluate:all
Evaluate up to 50 pending N/A jobs with LLM.

```bash
npm run evaluate:all \
  --provider zen         # Use cheaper provider
  --limit 50             # Adjust limit
```

**See:** [Evaluate Workflow](../workflows/evaluate.md)

### npm run evaluate:dry
Fetch job descriptions only, skip LLM calls.

```bash
npm run evaluate:dry \
  --limit 5              # Max jobs to fetch
```

**Output:** Dry-run report (no Postgres updates)

**See:** [Evaluate Workflow](../workflows/evaluate.md)

### npm run pdf
Generate ATS-friendly PDF from HTML template.

```bash
npm run pdf input.html output.pdf \
  --format a4            # Paper format (a4 or letter, default a4)
```

**Input:** HTML file (usually `templates/cv-template.html`)
**Output:** PDF file

**See:** [Workflows Overview](../workflows/overview.md)

## Application Tracking

### npm run tracker -- list
List all applications for the current user.

```bash
npm run tracker -- list \
  --json                 # JSON output (machine-readable)
  --limit 10             # Show first N (default: all)
  --status Applied       # Filter by status
```

**Output:** Table or JSON list of applications

### npm run tracker -- update
Update an application's status.

```bash
npm run tracker -- update \
  --num <uuid>           # Application UUID
  --status Applied       # New status
```

**Output:** Updated application row

### npm run tracker -- save
Save a new application and report to Postgres and MinIO.

⚠️ **Deprecated** — Use evaluate workflow instead.

## Portal Management

### npm run portals -- list
List all scan targets (portals).

```bash
npm run portals -- list
```

**Output:** Table of portals (name, API, URL, enabled)

### npm run portals -- add
Add a new scan target.

```bash
npm run portals -- add \
  --name "Acme Corp" \
  --url "https://jobs.acme.com"
```

**Optional:**
```bash
  --api "https://custom-api.com/jobs"  # Explicit API endpoint
```

### npm run portals -- update
Update a portal's configuration.

```bash
npm run portals -- update \
  --name "Acme Corp" \
  --url "https://new-url.com" \
  --api "https://new-api.com"
```

### npm run portals -- delete
Delete a portal.

```bash
npm run portals -- delete --name "Acme Corp"
```

### npm run portals -- enable
Enable scanning for a portal.

```bash
npm run portals -- enable --name "Acme Corp"
```

### npm run portals -- disable
Disable scanning for a portal.

```bash
npm run portals -- disable --name "Acme Corp"
```

### npm run portals -- keywords list
List title-filter keywords.

```bash
npm run portals -- keywords list
```

**Output:** Positive and negative keywords

### npm run portals -- keywords add
Add a keyword.

```bash
npm run portals -- keywords add \
  --kind positive \
  --value "software engineer"
```

### npm run portals -- keywords del
Delete a keyword.

```bash
npm run portals -- keywords del \
  --kind positive \
  --value "software engineer"
```

## Database Maintenance

### npm run db:backfill
Update all applications with new score calculations.

```bash
npm run db:backfill           # Apply changes
npm run db:backfill:dry       # Preview (dry-run)
```

**Use:** After changing score weighting

**See:** [Operations: Maintenance](./maintenance.md)

### npm run db:normalize-keywords
Deduplicate and normalize keywords.

```bash
npm run db:normalize-keywords          # Apply
npm run db:normalize-keywords:dry      # Preview
```

**See:** [Operations: Maintenance](./maintenance.md)

### npm run db:migrate-multitenant
Initialize multi-user schema (first-time setup).

```bash
npm run db:migrate-multitenant         # Apply
npm run db:migrate-multitenant:dry     # Preview
```

### npm run db:migrate-bucket
Migrate reports to different MinIO bucket.

```bash
npm run db:migrate-bucket              # Migrate
npm run db:migrate-bucket:dry          # Preview
```

### npm run db:restore
Restore applications from backup.

```bash
npm run db:restore                     # Restore
npm run db:restore:dry                 # Preview
```

### npm run db:check
Validate portal configurations.

```bash
npm run db:check
```

**Output:** Health report (portals, APIs, URLs, enabled status)

## DynamoDB Management

### npm run dynamo:init
Initialize DynamoDB tables (CVs, Profiles).

```bash
npm run dynamo:init
```

**Use:** First-time setup or reset

### npm run dynamo:cv
Upload CV to DynamoDB from local file.

```bash
npm run dynamo:cv
```

**Source:** `/cv.md`
**Destination:** DynamoDB `CVs` table

### npm run dynamo:profile
Upload profile to DynamoDB from local file.

```bash
npm run dynamo:profile
```

**Source:** `/config/profile.yml`
**Destination:** DynamoDB `Profiles` table

## Web Dashboard

### npm run dev (from web/)
Start web dashboard in development mode.

```bash
cd web
npm run dev
```

**Output:** http://localhost:3000

### npm run build (from web/)
Build web dashboard for production.

```bash
cd web
npm run build
npm run start
```

## Build & Testing

### npm run build
Build CLI and library code.

```bash
npm run build
# Outputs to dist/
```

### npm run test
Run unit tests.

```bash
npm run test                 # Single run
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

### npm run test:e2e
Run end-to-end tests (requires Docker services).

```bash
docker compose up -d
npm run test:e2e
```

### npm run check
Run type check, lint, and tests.

```bash
npm run check
```

**Equivalent to:**
```bash
npm run typecheck && npm run lint && npm run test
```

## Common Workflows

### First-Time Setup

```bash
# 1. Install dependencies
npm install && cd web && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with API keys

# 3. Start services
docker compose up -d

# 4. Initialize database
npm run db:migrate:multitenant
npm run dynamo:init
npm run dynamo:cv
npm run dynamo:profile

# 5. Add portals and keywords
npm run portals -- add --name "Acme" --url "https://..."
npm run portals -- keywords add --kind positive --value "engineer"

# 6. Run first scan
npm run scan

# 7. Start web dashboard
cd web
npm run dev
```

### Daily Workflow

```bash
# 1. Scan for new jobs
npm run scan

# 2. Evaluate pending jobs
npm run evaluate:all

# 3. View results (CLI)
npm run tracker -- list

# 4. Or browse web dashboard
cd web
npm run dev
# http://localhost:3000
```

### Troubleshooting

```bash
# Check portal health
npm run db:check

# List all applications (JSON)
npm run tracker -- list --json | jq '.'

# Dry-run an evaluation
npm run evaluate:dry --limit 1

# View logs
npm run scan -- --verbose
npm run evaluate -- --verbose
```

## See Also

- [Operations Overview](./overview.md) — Operational tasks and scripts
- [Workflows Overview](../workflows/overview.md) — How to use the pipeline
