# Mode: scan — Portal Scanner (Role Discovery)

Scans the configured job portals, filters by title relevance, and adds new roles to the pipeline for later evaluation.

## Recommended execution

Run as a subagent so it doesn't consume the main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Postgres is the **single source of truth** — there is no `portals.yml`. Manage scan targets with:

| Action | Command |
|--------|---------|
| List portals | `npm run portals -- list` |
| Add a portal | `npm run portals -- add --name "Acme" --url "https://jobs.ashbyhq.com/acme"` |
| Update a portal | `npm run portals -- update --name "Acme" --url "https://..."` |
| Delete a portal | `npm run portals -- delete --name "Acme"` |
| Enable / disable | `npm run portals -- enable|disable --name "Acme"` |
| Title-filter keywords | `npm run portals -- keywords list|add|del` |

The DB contains:
- `Portal` table: name, `careersUrl` for direct navigation, optional `api` (Greenhouse), `scanMethod`, `scanQuery`, `notes`, `enabled`
- `FilterKeyword` table: positive/negative title-filter keywords

## Discovery strategy (4 levels)

### Level 0 — Apify MCP scrapers (BROADEST REACH)

**Requires:** Apify MCP server configured in `.vscode/mcp.json` with a valid APIFY_TOKEN.

Use Apify actors to scrape job boards at scale. This level is the broadest — it searches LinkedIn, Google Jobs, Indeed, and other aggregators that Playwright alone can't access (login walls, anti-bot).

**Workflow:**
1. Use `search-actors` tool to find job scraping actors (e.g., `bebity/google-jobs-scraper`, `curious_coder/linkedin-jobs-search-scraper`, `misceres/indeed-scraper`)
2. Use `add-actor` to register the best actor as a tool
3. Call the actor with search parameters from `portals.yml` (`title_filter.positive` keywords + location)
4. Parse results → extract `{title, url, company, location, posted_date}`
5. Feed into the same title filter + dedup pipeline as other levels

**Recommended Apify actors for job scanning:**
- `bebity/google-jobs-scraper` — Google Jobs (free, fast, broad coverage)
- `curious_coder/linkedin-jobs-search-scraper` — LinkedIn Jobs (no login needed)
- `misceres/indeed-scraper` — Indeed listings
- `apify/google-search-scraper` — Google SERPs with `site:` filters (replaces Level 3 WebSearch)

**When to use Apify vs other levels:**
- Apify excels at aggregator sites (Google Jobs, LinkedIn, Indeed) that have anti-bot protection
- Apify is slower (runs on Apify cloud) but returns structured data
- Other levels are faster for direct career pages (Greenhouse, Ashby)
- Use ALL levels together for maximum coverage

### Level 1 — Direct Playwright (PRIMARY)

**For each company in `tracked_companies`:** Navigate to its `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read ALL visible job listings, and extract the title + URL of each. This is the most reliable method because:
- It sees the page in real time (no cached Google results)
- It works with SPAs (Ashby, Lever, Workday)
- It detects new roles instantly
- It doesn't depend on Google indexing

**Every company MUST have a `careers_url` in Postgres.** If it doesn't, find it once and add it: `npm run portals -- update --name "Acme" --url "https://..."`.

### Level 2 — Greenhouse API (COMPLEMENTARY)

For companies on Greenhouse, the JSON API (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) returns clean structured data. Use it as a fast complement to Level 1 — it's faster than Playwright but only works with Greenhouse.

### Level 3 — WebSearch queries (BROAD DISCOVERY)

The `search_queries` with `site:` filters cover portals cross-sectionally (all Ashby, all Greenhouse, etc.). Useful for discovering NEW companies not yet in `tracked_companies`, but the results may be stale.

**Execution priority:**
1. Level 1: Playwright → all `tracked_companies` with `careers_url`
2. Level 2: API → all `tracked_companies` with `api:`
3. Level 3: WebSearch → all `search_queries` with `enabled: true`

The levels are additive — they all run, and the results are merged and deduplicated.

## Workflow

1. **Read configuration**: Postgres `Portal` + `FilterKeyword` tables (`npm run portals -- list --json`).
2. **Read history**: `data/scan-history.tsv` → URLs already seen
3. **Read dedup sources**: applications in Postgres (`npm run tracker -- list --json`) + `data/pipeline.md`

4. **Level 1 — Playwright scan** (parallel in batches of 3-5):
   For each company in `tracked_companies` with `enabled: true` and a defined `careers_url`:
   a. `browser_navigate` to the `careers_url`
   b. `browser_snapshot` to read all job listings
   c. If the page has filters/departments, navigate the relevant sections
   d. For each job listing extract: `{title, url, company}`
   e. If the page paginates results, navigate additional pages
   f. Accumulate into the candidate list
   g. If `careers_url` fails (404, redirect), try `scan_query` as a fallback and note it to update the URL

5. **Level 2 — Greenhouse APIs** (parallel):
   For each company in `tracked_companies` with `api:` defined and `enabled: true`:
   a. WebFetch the API URL → JSON with the list of jobs
   b. For each job extract: `{title, url, company}`
   c. Accumulate into the candidate list (dedup with Level 1)

6. **Level 3 — WebSearch queries** (parallel if possible):
   For each query in `search_queries` with `enabled: true`:
   a. Run WebSearch with the defined `query`
   b. From each result extract: `{title, url, company}`
      - **title**: from the result title (before the " @ " or " | ")
      - **url**: the result URL
      - **company**: after the " @ " in the title, or extract from the domain/path
   c. Accumulate into the candidate list (dedup with Levels 1+2)

6. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 `positive` keyword must appear in the title (case-insensitive)
   - 0 `negative` keywords must appear
   - `seniority_boost` keywords give priority but are not required

7. **Deduplicate** against 3 sources:
   - `scan-history.tsv` → exact URL already seen
   - Applications in Postgres (`npm run tracker -- list --json`) → company + normalized role already evaluated
   - `pipeline.md` → exact URL already pending or processed

8. **For each new role that passes the filters**:
   a. Add to the `pipeline.md` "Pending" section: `- [ ] {url} | {company} | {title}`
   b. Record in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Roles filtered out by title**: record in `scan-history.tsv` with status `skipped_title`
10. **Duplicate roles**: record with status `skipped_dup`
11. **Prune closed postings**: after inserting new jobs, the CLI automatically deletes any Postgres `Application` row whose job no longer appears in the scan's relevant results — **unless** the candidate has already engaged (`Applied`, `Responded`, `Interview`, `Offer`, `Rejected`). `Evaluated` / `Discarded` / `SKIP` applications for closed postings are deleted because a score and report for a closed job have no actionable value.

## Title and company extraction from WebSearch results

WebSearch results come in the format: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Extraction patterns per portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a non-publicly-accessible URL is found:
1. Save the JD to `jds/{company}-{role-slug}.md`
2. Add to pipeline.md as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` tracks ALL seen URLs:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
```

## Output summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries run: N
Roles found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
New ones added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /career-ops pipeline to evaluate the new roles.
```

## Managing careers_url

Every company in `tracked_companies` must have a `careers_url` — the direct URL to its jobs page. This avoids searching for it every time.

**Known patterns per platform:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **Custom:** The company's own URL (e.g.: `https://openai.com/careers`)

**If `careers_url` doesn't exist** for a company:
1. Try its known platform pattern
2. If that fails, do a quick WebSearch: `"{company}" careers jobs`
3. Navigate with Playwright to confirm it works
4. **Save the found URL to Postgres**: `npm run portals -- update --name "..." --url "https://..."`

**If `careers_url` returns 404 or a redirect:**
1. Note it in the output summary
2. Try scan_query as a fallback
3. Mark it for manual update

## Maintaining portals in Postgres

- **ALWAYS set `careers_url`** when adding a new company: `npm run portals -- add --name "X" --url "https://..."`
- Disable noisy portals: `npm run portals -- disable --name "X"`
- Fix a broken URL: `npm run portals -- update --name "X" --url "https://..."`
- Adjust title-filter keywords: `npm run portals -- keywords add|del --kind positive|negative --value "keyword"`
- Companies change ATS platforms — verify `careers_url` periodically and update in Postgres
