# Mode: batch — Bulk Role Processing

Two usage modes: **conductor --chrome** (navigates portals in real time) or **standalone** (script for already-collected URLs).

## Architecture

```
Claude Conductor (claude --chrome --dangerously-skip-permissions)
  │
  │  Chrome: navigates portals (logged-in sessions)
  │  Reads the DOM directly — the user sees everything in real time
  │
  ├─ Role 1: reads JD from the DOM + URL
  │    └─► claude -p worker → report→Nextcloud + row→Postgres (npm run tracker -- save) + PDF
  │
  ├─ Role 2: click next, reads JD + URL
  │    └─► claude -p worker → report→Nextcloud + row→Postgres (npm run tracker -- save) + PDF
  │
  └─ End: summary (each worker already persisted to Postgres + Nextcloud)
```

Each worker is a child `claude -p` with a clean 200K-token context. The conductor only orchestrates.

## Files

```
batch/
  batch-input.tsv               # URLs (by conductor or manual)
  batch-state.tsv               # Progress (auto-generated, gitignored)
  batch-runner.sh               # Standalone orchestrator script
  batch-prompt.md               # Prompt template for workers
  logs/                         # One log per role (gitignored)
```

Each worker persists directly to Postgres + Nextcloud via `npm run tracker -- save` (no TSV merge).

## Mode A: Conductor --chrome

1. **Read state**: `batch/batch-state.tsv` → know what's already been processed
2. **Navigate portal**: Chrome → search URL
3. **Extract URLs**: Read the results DOM → extract the list of URLs → append to `batch-input.tsv`
4. **For each pending URL**:
   a. Chrome: click the role → read the JD text from the DOM
   b. Save the JD to `/tmp/batch-jd-{id}.txt`
   c. Compute the next sequential REPORT_NUM
   d. Run via Bash:
      ```bash
      claude -p --dangerously-skip-permissions \
        --append-system-prompt-file batch/batch-prompt.md \
        "Process this role. URL: {url}. JD: /tmp/batch-jd-{id}.txt. Report: {num}. ID: {id}"
      ```
   e. Update `batch-state.tsv` (completed/failed + score + report_num)
   f. Log to `logs/{report_num}-{id}.log`
   g. Chrome: go back → next role
5. **Pagination**: If there are no more roles → click "Next" → repeat
6. **End**: summary. Each worker already persisted its report to Nextcloud and its row to Postgres via `npm run tracker -- save` (no merge to `applications.md`).

## Mode B: Standalone script

```bash
batch/batch-runner.sh [OPTIONS]
```

Options:
- `--dry-run` — list pending without running
- `--retry-failed` — only retry failed ones
- `--start-from N` — start from ID N
- `--parallel N` — N workers in parallel
- `--max-retries N` — attempts per role (default: 2)

## batch-state.tsv format

```
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Error msg	1
3	https://...	pending	-	-	-	-	-	0
```

## Resumability

- If it dies → re-run → reads `batch-state.tsv` → skip completed
- A lock file (`batch-runner.pid`) prevents double execution
- Each worker is independent: a failure on role #47 doesn't affect the others

## Workers (claude -p)

Each worker receives `batch-prompt.md` as the system prompt. It is self-contained.

The worker produces:
1. Report → Nextcloud + row → Postgres via `npm run tracker -- save --company X --role Y --url U --score N --file /tmp/eval-{id}.md`
2. PDF in `output/`
3. Result JSON on stdout

## Error handling

| Error | Recovery |
|-------|----------|
| URL inaccessible | Worker fails → conductor marks `failed`, next |
| JD behind login | Conductor tries to read the DOM. If it fails → `failed` |
| Portal changes layout | Conductor reasons over the HTML, adapts |
| Worker crashes | Conductor marks `failed`, next. Retry with `--retry-failed` |
| Conductor dies | Re-run → reads state → skip completed |
| PDF fails | Report is already in Nextcloud + row in Postgres. PDF stays pending (`--pdf ❌`) |
