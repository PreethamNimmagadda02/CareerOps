# CareerOps Architecture Overview

This document explains how CareerOps is structured, how data flows through the system, and how the major components interact.

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                  User (CLI / Web Dashboard)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐  ┌──────────┐  ┌────────────┐
   │   CLI   │  │  Web API │  │ Auth/OAuth │
   │ (scan,  │  │ (Next.js)│  │ (NextAuth) │
   │ evaluate)   └──────────┘  └────────────┘
   └──────┬──┘        │              │
          │           └──────┬───────┘
          │                  │
          ▼                  ▼
   ┌──────────────────────────────┐
   │   Core Libraries (src/lib/)   │
   │  - scanner.ts (job discovery) │
   │  - llm.ts (LLM integration)   │
   │  - prompt.ts (evaluation)     │
   │  - tracker.ts (persistence)   │
   │  - minio.ts (report storage)  │
   └──────────────────────────────┘
          │
   ┌──────┴────────────────────────┐
   │                               │
   ▼                               ▼
┌──────────────┐          ┌──────────────────┐
│   Postgres   │          │  MinIO (S3)      │
│   (Prisma)   │          │  (Reports)       │
│              │          │                  │
│ - Users      │          │ - Evaluation     │
│ - Apps       │          │   reports        │
│ - Portals    │          │ - Resumes        │
│ - Keywords   │          │ - Profiles       │
│ - Sessions   │          └──────────────────┘
└──────────────┘
   │
   ▼ (optional)
┌──────────────┐
│  DynamoDB    │
│              │
│ - CVs        │
│ - Profiles   │
└──────────────┘
```

## Data Flow

### 1. Scan Pipeline

```
Postgres (Portal + FilterKeyword) 
    ↓
scanner.ts (Greenhouse/Ashby/Lever/Playwright)
    ↓
Title matching (matching.ts: title, location, engineering)
    ↓
Deduplication (by URL)
    ↓
Postgres Application table (status = "N/A")
```

### 2. Evaluate Pipeline

```
Postgres Application (status = "N/A")
    ↓
fetchJD (extract job description from URL)
    ↓
buildPrompt (src/lib/prompt.ts + CV/profile from DynamoDB)
    ↓
callLLM (OpenAI-compatible: NVIDIA or Zen)
    ↓
parseScore (extract A–F evaluation + weighted score)
    ↓
MinIO (store full report markdown)
    ↓
Postgres Application (status = "Evaluated", score updated, reportUrl populated)
```

### 3. Track Pipeline

```
Postgres Application (all statuses)
    ↓
tracker.ts (read, update, create)
    ↓
UI (web dashboard or CLI `tracker -- list`)
    ↓
Status changes → Postgres (with updatedAt timestamp)
```

---

## Major Components

### CLI (`src/cli/`)

Entry points that orchestrate library functions. Each is a thin wrapper around pure `src/lib/` modules.

| File | Purpose | Inputs | Outputs |
|------|---------|--------|---------|
| `scan.ts` | Discover jobs | Postgres (Portal, FilterKeyword) | Postgres (Application) |
| `evaluate.ts` | Score jobs | Postgres (Application) + CV/profile | MinIO reports + Postgres updates |
| `pdf.ts` | Render CV | HTML template | PDF file |
| `tracker.ts` | List/update apps | Postgres | Console table or JSON |
| `portals.ts` | Manage scan targets | CLI args or Postgres | Postgres (Portal, FilterKeyword) |

### Libraries (`src/lib/`)

Pure, testable building blocks. Each module has a single responsibility.

#### Core Workflows

| File | Purpose | Key Functions |
|------|---------|---|
| `scanner.ts` | Job board integration | `scanCompany()`, `scanCompanyBrowser()`, `hasStructuredApi()` |
| `matching.ts` | Job filtering | `titleMatches()`, `engineeringMatch()`, `locationMatch()`, `isHighSignal()` |
| `jd.ts` | Job description extraction | `fetchJD()`, `isJdOk()` |
| `llm.ts` | LLM provider integration | `resolveProvider()`, `callLLM()` |
| `prompt.ts` | Evaluation prompt building | `buildPrompt()`, `parseScore()` |
| `tracker.ts` | Persistence layer | `getApplications()`, `updateTracker()`, `writeReport()` |

#### Infrastructure

| File | Purpose | Key Functions |
|------|---------|---|
| `db.ts` | Prisma client | Exports `db` instance |
| `minio.ts` | MinIO S3 storage | `uploadReport()`, `downloadReport()`, `getReportUrl()` |
| `dynamo.ts` | DynamoDB client | Exports initialized DynamoDB DocumentClient |
| `cv-store.ts` | CV storage (DynamoDB) | `getCV()`, `putCV()` |
| `profile-store.ts` | Profile storage (DynamoDB) | `getProfile()`, `putProfile()` |
| `owner.ts` | User resolution | `resolveOwnerUserId()` |
| `portals-db.ts` | Portal + keyword loading | `loadConfigFromDb()` |

#### Utilities

| File | Purpose |
|------|---------|
| `args.ts` | CLI argument parsing |
| `concurrency.ts` | Parallel execution: `mapLimit()`, semaphores |
| `env.ts` | Environment variable loading |
| `logger.ts` | Leveled logging (debug, info, warn, error) |
| `text.ts` | String utilities (slugify, dedup, normalize URLs) |
| `paths.ts` | Project path resolution |
| `pdf.ts` | Chromium-based PDF rendering |
| `candidate-loader.ts` | Load CV + profile for evaluation context |
| `profile-validation.ts` | Pre-flight validation of candidate data |

### Web Dashboard (`web/`)

Next.js app with App Router, server components, and shadcn/ui components.

#### API Routes (`web/app/api/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/applications` | GET | Fetch all applications for the signed-in user |
| `/api/applications` | PATCH | Update application status |
| `/api/metrics` | GET | Aggregate metrics (total, scores, counts by status) |
| `/api/reports/:num` | GET | Fetch a single report (markdown + header) |
| `/api/pipeline/:command` | POST | Stream pipeline execution (`scan`, `evaluate`, etc.) |
| `/api/profile` | GET/POST | Fetch/update user profile |
| `/api/profile/resume/*` | GET/POST | Resume upload/download |
| `/api/keywords/:action` | GET/POST | Manage title-filter keywords |
| `/api/onboarding/:action` | POST | Onboarding funnel (first-time setup) |

#### Components

| Component | Purpose |
|-----------|---------|
| `dashboard.tsx` | Main view: metrics cards, applications table, status tabs |
| `report-modal.tsx` | Full-screen report viewer (markdown → HTML) |
| `pipeline-provider.tsx` | Real-time pipeline execution (WebSocket-like streaming) |
| `keywords-manager.tsx` | Manage positive/negative title filters |
| `profile-view.tsx` | Resume upload, profile editing, skill management |
| `launch-pad.tsx` | Onboarding flow (initial setup) |
| `status-badge.tsx`, `status-menu.tsx` | Status display and editing |

#### Auth

| File | Purpose |
|------|---------|
| `auth.ts` | Auth.js v5 configuration |
| `auth.config.ts` | OAuth provider setup (Google, GitHub) |
| `middleware.ts` | Session validation for protected routes |

### Database (`prisma/schema.prisma`)

Multi-user Postgres schema with Auth.js tables.

**Core tables:**

- **User** — Account info, resume/profile storage references
- **Account, Session** — Auth.js OAuth state
- **Application** — Job applications (indexed by userId + url, status flow)
- **Portal** — Scan targets (company careers pages, APIs)
- **FilterKeyword** — Title-filter keywords (positive/negative, scoped to userId)

See [Storage & Data Models](../storage/overview.md) for full schema documentation.

---

## Request/Response Flow

### Web Dashboard: Viewing Applications

```
1. User logs in (OAuth via Auth.js) → nextauth session created
2. GET /api/applications?userId=...
3. Web calls db.application.findMany({ where: { userId } })
4. Enrichment: fetch report summaries from MinIO (if reportPath set)
5. Return list to component (dashboard.tsx)
6. React renders table with sortable columns (score, date, company, status)
```

### CLI: Evaluating a Job

```
1. npm run evaluate [--limit N] [--provider X] [--model Y]
2. Load owner user (CAREER_OPS_USER_EMAIL)
3. Fetch pending N/A applications from Postgres
4. For each app:
   a. Fetch JD from URL (Playwright)
   b. Load CV + profile from DynamoDB
   c. Build evaluation prompt (src/lib/prompt.ts)
   d. Call LLM (OpenAI-compatible)
   e. Parse score (A–F + weighted 1–5)
   f. Upload report to MinIO (markdown)
   g. Update Postgres row (score, reportUrl, status → Evaluated)
```

---

## Key Design Decisions

### 1. **Postgres as Source of Truth**

Applications, portals, and keywords all live in Postgres. This enables:
- Multi-user scoping (all data filtered by `userId`)
- Transactional consistency (status changes are atomic)
- Easy querying from both CLI and web

### 2. **MinIO for Report Storage**

Evaluation reports (markdown) are stored in MinIO S3, not Postgres. This allows:
- Unbounded report size (full A–F evaluation + interview prep)
- Easy sharing of URLs (pre-signed or public download links)
- Cost-effective storage (S3 is cheaper than Postgres for large text blobs)
- Postgres just stores the reference (reportName, reportUrl)

### 3. **DynamoDB for Candidate Context**

CV and profile data live in DynamoDB, not Postgres. This allows:
- Flexibility (JSON-like schema, easy schema evolution)
- Quick iteration (no schema migrations for candidate data)
- Future multi-region scaling (DynamoDB Global Tables)

### 4. **Library-First Architecture**

Core logic lives in pure `src/lib/` modules, not in CLI or web-specific code. This allows:
- Code reuse (CLI and web both call the same `tracker.ts`)
- Testability (libraries have 100% test coverage target)
- Easy CLI-to-agent migration (agents can call libraries directly)

### 5. **Prisma for Type Safety**

Prisma generates TypeScript types from the schema. This enables:
- Type-safe database queries
- IDE autocomplete for DB operations
- Automatic enum generation (`AppStatus`, etc.)

---

## Deployment Topology

### Local Development

```
npm run dev (web)
npm run scan (CLI)
↓
localhost:3000 (web) + localhost:5432 (Postgres)
+ localhost:9000 (MinIO) + localhost:8000 (DynamoDB)
```

### Production (Docker)

```
- Postgres: RDS or managed
- MinIO: Hosted S3 or compatible
- DynamoDB: AWS DynamoDB
- Web: Next.js on container/serverless
- CLI: Cron jobs or GitHub Actions
```

See [Operations & Maintenance](../operations/overview.md) for deployment details.

---

## Extension Points

### Add a New Job Board Scanner

1. Add scanner logic to `src/lib/scanner.ts` (new `case "boardName":` in `scanCompany()`)
2. Add test in `tests/scanner.test.ts`
3. Register the board in `Portal.api` column or auto-detect from domain
4. Run `npm run scan` to test

### Add a New LLM Provider

1. Add provider config to `src/lib/llm.ts` (`PROVIDERS` dict)
2. Implement auth resolution and default model
3. Test with `npm run evaluate -- --provider newprovider --model model-name`

### Add a New Web Component

1. Create component in `web/components/`
2. Import in a page or layout (`web/app/page.tsx`, etc.)
3. Use shadcn/ui primitives (button, modal, table, etc.) for consistency

### Add a New API Endpoint

1. Create route in `web/app/api/resource/route.ts`
2. Use `getUserSession()` to authenticate
3. Call `src/lib/` functions or Prisma directly
4. Return JSON response

---

## Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Libraries | Vitest | ~80% (unit tests in `/tests/*.test.ts`) |
| E2E | Vitest + fixtures | Integration with real Postgres/DynamoDB |
| Web | Manual (no automated frontend tests yet) | Ad-hoc in dev |

Run tests with `npm run test`, `npm run test:watch`, or `npm run test:e2e`.

---

## Performance Considerations

### Scan Pipeline

- **Concurrency**: Default 12 structured APIs, 8 browser instances
- **Deduplication**: O(1) at write time (unique index on Application.url)
- **Bottleneck**: Browser instances (Playwright is CPU-heavy)

### Evaluate Pipeline

- **Concurrency**: Default 8 parallel LLM calls
- **Bottleneck**: LLM API rate limits (typically 10–50 req/min)
- **Optimization**: Batch fetch JDs in parallel before LLM calls

### Web Dashboard

- **Query optimization**: Applications indexed by (userId, createdAt desc)
- **Enrichment**: Lazy-load report summaries (only fetch if user views)
- **Caching**: Session tokens cached in browser (NextAuth handles TTL)

---

## Related Documentation

- [Scan Workflow](../workflows/scan.md) — How job discovery works
- [Evaluate Workflow](../workflows/evaluate.md) — How LLM evaluation works
- [Web Dashboard API](../web-dashboard/api.md) — Detailed API reference
- [Storage Models](../storage/schema.md) — Detailed database schema
