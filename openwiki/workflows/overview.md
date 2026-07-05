# CareerOps Workflows Overview

This section documents the four core workflows that power CareerOps: scanning, evaluating, PDF generation, and tracking. Each workflow can be triggered via CLI, web API, or AI agents.

## Quick Reference

| Workflow | Command | Entry Point | Data Source | Output |
|----------|---------|-------------|-------------|--------|
| **Scan** | `npm run scan` | `src/cli/scan.ts` | Postgres (Portal, FilterKeyword) | Postgres (Application, status=N/A) |
| **Evaluate** | `npm run evaluate` | `src/cli/evaluate.ts` | Postgres (Application, N/A) | MinIO (report), Postgres (score) |
| **PDF** | `npm run pdf` | `src/cli/pdf.ts` | HTML template + resume file | PDF file |
| **Track** | `npm run tracker` | `src/cli/tracker.ts` | Postgres (Application) | Console/JSON output |

Each workflow is documented in detail in the pages linked below.

---

## Workflow 1: Scan (Job Discovery)

**Purpose:** Discover relevant jobs across configured company portals and job boards.

**Command:**
```bash
npm run scan          # API-based companies only
npm run scan:fallback # API + Playwright browser fallback
```

**Data Flow:**
1. Load scan targets from Postgres (`Portal`, `FilterKeyword` tables)
2. For each enabled company, fetch jobs using one of four methods:
   - **Greenhouse API** (fast, structured)
   - **Ashby API** (fast, structured)
   - **Lever API** (fast, structured)
   - **Playwright** (fallback for non-API boards)
3. Filter by title keywords (positive/negative), engineering relevance, location
4. Deduplicate by URL against existing Postgres rows
5. Insert new jobs into Postgres (`Application` table, status=N/A)

**Key Files:**
- `src/cli/scan.ts` — Main CLI orchestrator
- `src/lib/scanner.ts` — Job board integrations
- `src/lib/matching.ts` — Title/location/engineering filters
- `src/lib/portals-db.ts` — Load Portal + FilterKeyword from Postgres

**Configuration:**
- **Scan targets** (portals) → `npm run portals -- list|add|update|delete`
- **Title filters** → `npm run portals -- keywords list|add|del`

**See:** [Full Scan Workflow Guide](./scan.md)

---

## Workflow 2: Evaluate (LLM Scoring)

**Purpose:** Fetch job descriptions and score them against your CV using an LLM.

**Command:**
```bash
npm run evaluate              # Evaluate up to 5 pending jobs
npm run evaluate:all          # Evaluate up to 50 pending jobs
npm run evaluate -- --dry-run # Fetch JDs only, skip LLM and write
```

**Data Flow:**
1. Fetch pending N/A jobs from Postgres
2. For each job:
   a. Extract job description from URL (Playwright)
   b. Load CV + profile from DynamoDB
   c. Build evaluation prompt (src/lib/prompt.ts)
   d. Call LLM (OpenAI-compatible: NVIDIA, Zen, or custom)
   e. Parse score (A–F evaluation + weighted 1–5)
   f. Upload report to MinIO (full markdown)
   g. Update Postgres row with score, reportUrl, status→Evaluated

**Evaluation Structure (A–F):**
- **A** — Role summary & your fit
- **B** — CV match (gaps + mitigation)
- **C** — Level strategy
- **D** — Compensation research
- **E** — CV personalization plan
- **F** — Interview prep (STAR stories)

**Final Score:** Weighted average of 10 dimensions (each 1–5)

**Key Files:**
- `src/cli/evaluate.ts` — Main CLI orchestrator
- `src/lib/llm.ts` — LLM provider integration (NVIDIA, Zen, custom)
- `src/lib/prompt.ts` — Evaluation prompt construction
- `src/lib/jd.ts` — Job description extraction
- `src/lib/minio.ts` — Report upload
- `src/lib/candidate-loader.ts` — CV/profile loading

**LLM Providers:**
- `nvidia` (default) — NVIDIA NIM, `openai/gpt-oss-120b`
- `zen` — OpenCode, `deepseek-v4-flash-free`
- Custom — Configured in `~/.config/opencode/opencode.jsonc`

**See:** [Full Evaluate Workflow Guide](./evaluate.md)

---

## Workflow 3: PDF Generation

**Purpose:** Render a personalized, ATS-parseable CV from an HTML template.

**Command:**
```bash
npm run pdf -- <input.html> <output.pdf> [--format=a4|letter]
```

**Data Flow:**
1. Load HTML template (default: `templates/cv-template.html`)
2. Load CV data from DynamoDB (or local file fallback)
3. Render HTML → PDF using Chromium
4. Save PDF to output file

**Key Files:**
- `src/cli/pdf.ts` — Main CLI entry point
- `src/lib/pdf.ts` — Chromium-based rendering
- `templates/cv-template.html` — Default template

**Customization:**
- Modify `templates/cv-template.html` to change layout/styling
- Use DynamoDB to store candidate data (CV, profile)
- Or edit `/cv.md` (legacy fallback, used if DynamoDB is unavailable)

**See:** [Full PDF Workflow Guide](./pdf.md) (coming soon)

---

## Workflow 4: Track (Application Management)

**Purpose:** View, update, and manage application statuses in Postgres.

**Commands:**
```bash
npm run tracker -- list                   # List all applications
npm run tracker -- list --json            # JSON output
npm run tracker -- update --num <uuid> --status Applied  # Update status
npm run tracker -- save                   # (deprecated, used by evaluate internally)
```

**Data Flow:**
1. Query Postgres `Application` table for the current user
2. Enrich with report metadata (score, archetype, remote, comp, tldr)
3. Display in console table (sortable) or JSON
4. Allow status updates (write back to Postgres with updatedAt)

**Status Flow:**
```
N/A → Evaluated → Applied → Responded → Interview → Offer (or Rejected/Discarded)
```

**Key Files:**
- `src/cli/tracker.ts` — CLI orchestrator
- `src/lib/tracker.ts` — Database read/write logic
- `web/lib/tracker.ts` — Web API integration (same functions)

**See:** [Full Track Workflow Guide](./track.md) (coming soon)

---

## Multi-User Workflow

All workflows are scoped to a user:

- **CLI** → Uses `CAREER_OPS_USER_EMAIL` to resolve a user ID (or creates one on first run)
- **Web Dashboard** → Injects the signed-in user automatically (via NextAuth)

This means:
- Multiple users can run CLI pipelines independently (each gets their own email)
- Each user has their own applications, keywords, and reports
- The web dashboard filters all data by logged-in user

---

## Trigger Options

### CLI

```bash
npm run scan
npm run evaluate
npm run pdf -- in.html out.pdf
npm run tracker -- list
```

### Web API

```bash
POST /api/pipeline/scan
POST /api/pipeline/evaluate
GET /api/applications
PATCH /api/applications  # Update status
```

### GitHub Copilot Agents

See `/.github/agents/` for agent definitions (scanner.agent.md, evaluator.agent.md, etc.)

### Claude Code Modes

See `/modes/scan.md`, `/modes/batch.md`, etc. for Claude Code workflow guidance.

---

## Error Handling & Recovery

### Scan Fails

- Check Postgres connectivity: `npm run portals -- list`
- Check that at least one company portal is enabled
- Check that at least one positive title-filter keyword is set
- Check Playwright installation: `npx playwright install chromium`

### Evaluate Fails

- Check LLM API credentials (`NVIDIA_API_KEY` or `OPENCODE_API_KEY`)
- Check MinIO connectivity: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- Check Playwright installation (for JD extraction)
- Check DynamoDB connectivity for CV/profile loading

### PDF Fails

- Check Playwright Chromium installation
- Check input HTML file exists and is valid
- Check write permissions for output file

### Track Shows No Data

- Check `CAREER_OPS_USER_EMAIL` is set (CLI) or you're logged in (web)
- Check Postgres connectivity
- Check user ID matches (web shows signed-in user, CLI shows `CAREER_OPS_USER_EMAIL`)

---

## Performance Tips

### Scan

- **Increase concurrency** for faster scanning: `--concurrency 20` (default 12)
- **Limit browser instances** if Playwright crashes: `--browser-concurrency 4` (default 8)
- **Disable fallback** if not needed: `npm run scan` (vs `npm run scan:fallback`)

### Evaluate

- **Evaluate in batches**: `npm run evaluate -- --limit 10` (run multiple times)
- **Use cheaper LLM**: `npm run evaluate -- --provider zen` (cheaper than nvidia)
- **Dry-run first**: `npm run evaluate:dry` (fetch JDs without LLM calls)

### Database

- Index optimization is handled by Prisma/Postgres
- Applications are indexed by (userId, url) for deduplication
- Queries use indexes on userId for filtering

---

## Related Documentation

- [Scan Workflow](./scan.md) — Full scan discovery guide
- [Evaluate Workflow](./evaluate.md) — Full LLM evaluation guide
- [Track Workflow](./track.md) — Full tracking guide
- [Architecture Overview](../architecture/overview.md) — How workflows fit together
- [Web Dashboard API](../web-dashboard/api.md) — REST API for web triggers
