# Scan Workflow: Job Discovery

The scan workflow discovers relevant jobs across configured company portals and adds them to the Postgres applications table for later evaluation.

## High-Level Flow

```
Postgres (Portal + FilterKeyword)
    ↓
Load scan targets & title-filter keywords
    ↓
For each enabled company:
  - Try structured API (Greenhouse, Ashby, Lever)
  - Fall back to Playwright browser if --fallback
    ↓
  Filter by title, engineering relevance, location
    ↓
  Check for duplicates (by URL)
    ↓
Postgres Application table (insert new rows with status=N/A)
    ↓
Summary report (total found, duplicates, filtered out)
```

## Running a Scan

### Basic Scan (Structured APIs Only)

```bash
npm run scan
```

This scans all enabled companies that have a structured API endpoint (Greenhouse, Ashby, or Lever). It's fast and reliable.

### Scan with Browser Fallback

```bash
npm run scan:fallback
```

Same as above, but also uses Playwright to scrape companies without structured APIs. Slower, but catches more roles.

### Scan Options

```bash
npm run scan -- \
  --compact              # Compact logging (fewer details)
  --verbose              # Verbose logging (more details)
  --fallback             # Use browser fallback
  --concurrency 12       # Max parallel API calls (default 12)
  --browser-concurrency 8 # Max parallel browser instances (default 8)
```

## Configuration: Scan Targets & Keywords

Scan targets and keywords are stored in Postgres (`Portal` and `FilterKeyword` tables). Manage them with the `portals` CLI:

### List Portals

```bash
npm run portals -- list
```

Example output:
```
┌─────────┬──────────────────┬──────────────────────────────┬─────────┐
│ name    │ api              │ careersUrl                   │ enabled │
├─────────┼──────────────────┼──────────────────────────────┼─────────┤
│ Acme    │                  │ https://acme.ashbyhq.com/... │ true    │
│ Initech │ https://boards.. │ https://initech.com/careers  │ true    │
│ TPS Inc │                  │ https://tps.lever.co/...     │ true    │
└─────────┴──────────────────┴──────────────────────────────┴─────────┘
```

### Add a Portal

```bash
npm run portals -- add --name "CompanyName" --url "https://company.careers.url"
```

The scanner will auto-detect if the URL is Ashby or Lever. For Greenhouse companies, optionally specify the API endpoint:

```bash
npm run portals -- add --name "CustomCorp" --api "https://boards-api.greenhouse.io/v1/boards/customcorp/jobs"
```

### Update a Portal

```bash
npm run portals -- update --name "CompanyName" --url "https://new.url"
npm run portals -- update --name "CompanyName" --api "https://new.api"
```

### Delete a Portal

```bash
npm run portals -- delete --name "CompanyName"
```

### Enable / Disable a Portal

```bash
npm run portals -- enable --name "CompanyName"
npm run portals -- disable --name "CompanyName"
```

### Title-Filter Keywords

Keywords control which jobs are "relevant" and added to the shortlist. Each keyword is either **positive** (include) or **negative** (exclude).

#### List Keywords

```bash
npm run portals -- keywords list
```

Example:
```
Positive keywords: software engineer, backend engineer, platform engineer
Negative keywords: sales engineer, solutions engineer, data scientist
```

#### Add a Keyword

```bash
npm run portals -- keywords add --kind positive --value "software engineer"
npm run portals -- keywords add --kind negative --value "sales engineer"
```

#### Delete a Keyword

```bash
npm run portals -- keywords del --kind positive --value "software engineer"
```

**Important:** A scan with zero positive keywords will fail (no jobs can match). Always add at least one positive keyword before running a scan.

## Filtering Logic

### Title Matching

A job's title must:
1. **Match at least one positive keyword** (case-insensitive substring match)
2. **Not match any negative keyword**

Examples:
```
Positive: ["software engineer", "backend"]
Negative: ["sales", "solutions"]

✓ "Senior Software Engineer" — matches positive "software"
✓ "Backend Engineer, Python" — matches positive "backend"
✗ "Sales Engineer" — matches negative "sales"
✗ "Solutions Architect" — matches negative "solutions"
✗ "Data Scientist" — no positive match
```

### Engineering Relevance (Optional)

Additional filters can be enabled in your profile:
- **Exclude certain roles** (e.g., "no QA", "no DevOps")
- **Exclude certain technologies** (e.g., "no legacy .NET")

These are configurable but not in the current version. Keyword matching is the primary filter.

### Location Matching (Optional)

If your profile specifies location preferences:
- **Remote preference** — filter by remote-friendly roles
- **Regional preference** — filter by job location
- **Relocation openness** — filter accordingly

Currently handled during evaluation (not during scan), but can be extended.

## Deduplication

Jobs are deduplicated by **URL** at write time:

```
Postgres Application table has a unique index on (userId, url)
```

This means:
- If you scan the same company twice, duplicate URLs are ignored
- The unique index prevents accidental duplicate inserts at the DB level
- No need to pre-load existing jobs into memory (O(1) space efficiency)

## Structured API Support

### Greenhouse

Auto-detected from careers URLs like `https://jobs.greenhouse.io/company` or `https://company.greenhouse.io`.

**API endpoint:** `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs`

Example:
```bash
npm run portals -- add --name "Anthropic" --api "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs"
```

### Ashby

Auto-detected from URLs like `https://jobs.ashbyhq.com/{slug}`.

**API endpoint:** `https://api.ashbyhq.com/posting-api/job-board/{slug}`

Example:
```bash
npm run portals -- add --name "Acme" --url "https://jobs.ashbyhq.com/acme"
```

### Lever

Auto-detected from URLs like `https://jobs.lever.co/{slug}`.

**API endpoint:** `https://api.lever.co/v0/postings/{slug}?mode=json`

Example:
```bash
npm run portals -- add --name "TPS" --url "https://jobs.lever.co/tps-inc"
```

### Browser Fallback (Playwright)

For companies without a structured API, use Playwright to scrape the careers page:

```bash
npm run scan:fallback
```

The browser reads the `careersUrl` and extracts all visible job listings. It's slower but works with any website.

## Concurrency & Performance

### API Scanning (Structured)

- Default: 12 parallel API calls
- Each API call is fast (~200ms)
- **Bottleneck:** API rate limits (if any)

```bash
npm run scan -- --concurrency 24  # More parallel calls
```

### Browser Scanning (Fallback)

- Default: 8 parallel Playwright instances
- Each browser session is memory-intensive
- **Bottleneck:** CPU and memory

```bash
npm run scan:fallback -- --browser-concurrency 4  # Fewer browsers
```

You can combine both limits:

```bash
npm run scan:fallback -- --concurrency 12 --browser-concurrency 6
```

## Scan Result Summary

After a scan completes, you'll see a summary like:

```
✓ Scan complete: 147 total jobs
  ├─ 89 engineering-relevant
  ├─ 34 new (added to shortlist)
  ├─ 12 duplicates (already in Postgres)
  ├─ 21 filtered by title
  └─ Scan time: 2m 15s
```

The shortlist (new jobs) are now in Postgres with status **N/A** and ready for evaluation.

## Troubleshooting

### Scan fails with "No positive keywords"

**Error:**
```
❌ No title-filter keywords configured. Add at least one "Include" keyword.
```

**Fix:**
```bash
npm run portals -- keywords add --kind positive --value "software engineer"
npm run scan
```

### Scan fails with "No portals in Postgres"

**Error:**
```
❌ No portals in Postgres. Add some first: npm run portals -- add --name X --url U
```

**Fix:**
```bash
npm run portals -- add --name "Acme" --url "https://acme.ashbyhq.com/..."
npm run scan
```

### Browser crashes during fallback scan

**Error:**
```
Playwright: timeout waiting for selector on page
```

**Fix:**
- Reduce browser concurrency: `--browser-concurrency 2`
- Disable problematic portals: `npm run portals -- disable --name "ProblematicSite"`
- Check Playwright is installed: `npx playwright install chromium`

### API returns unexpected data format

**Symptom:** Scan completes but finds zero jobs from a known portal.

**Diagnosis:** The API response format may have changed.

**Fix:**
1. Test the API manually: `curl "https://api.ashbyhq.com/posting-api/job-board/SLUG"`
2. Check the response structure in `src/lib/scanner.ts`
3. File an issue or submit a PR to update the parser

## Typical Workflow

```bash
# 1. Set up your scan targets (once)
npm run portals -- add --name "Acme" --url "https://acme.ashbyhq.com/..."
npm run portals -- add --name "Initech" --url "https://initech.greenhouse.io/..."

# 2. Set up title filters (once)
npm run portals -- keywords add --kind positive --value "software engineer"
npm run portals -- keywords add --kind positive --value "backend engineer"
npm run portals -- keywords add --kind negative --value "sales engineer"

# 3. Scan for new jobs (daily or weekly)
npm run scan:fallback

# 4. View the shortlist
npm run tracker -- list | grep "N/A"

# 5. Evaluate top candidates
npm run evaluate -- --limit 5
```

## Key Files

- `src/cli/scan.ts` — Main scan orchestrator
- `src/lib/scanner.ts` — Greenhouse, Ashby, Lever, and browser implementations
- `src/lib/matching.ts` — Title, location, and engineering filters
- `src/lib/text.ts` — URL normalization, deduplication
- `src/lib/portals-db.ts` — Load Portal and FilterKeyword from Postgres

## See Also

- [Workflows Overview](./overview.md)
- [Architecture Overview](../architecture/overview.md)
- [Operations: Database Maintenance](../operations/maintenance.md)
