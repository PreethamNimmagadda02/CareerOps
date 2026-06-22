# Architecture

## System Overview

Career-Ops now has two agent surfaces:

- **Claude Code**: reads `CLAUDE.md`, `.claude/skills/`, and `modes/*.md`; supports `claude -p` batch workers and visible-browser workflows.
- **GitHub Copilot**: reads `.github/copilot-instructions.md`, `.github/agents/*.agent.md`, `.github/prompts/*.prompt.md`, `.github/instructions/*.instructions.md`, and `AGENTS.md`; supports Copilot chat/agent workflows and GitHub Actions JD collection for batch prep.

```
                    ┌─────────────────────────────────┐
                    │  Claude Code or GitHub Copilot   │
                    │    (shared modes + agent files)  │
                    └──────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                       │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌───────────▼────────┐
     │ Single Eval  │   │ Portal Scan │   │   Batch Process    │
     │ (auto-pipe)  │   │  (scan.md)  │   │   (batch-runner)   │
     └──────┬──────┘   └──────┬──────┘   └───────────┬────────┘
            │                  │                       │
            │           ┌──────▼──────┐          ┌────▼─────┐
            │           │ pipeline.md │          │ N workers│
            │           │ (URL inbox) │          │ (claude -p)
            │           └─────────────┘          └────┬─────┘
            │                                          │
     ┌──────▼──────────────────────────────────────────▼──────┐
     │                    Output Pipeline                      │
     │  ┌──────────┐  ┌────────────┐  ┌───────────────────┐  │
     │  │ Report   │  │  PDF (HTML  │  │ Tracker row       │  │
     │  │ (A-F eval)│  │  → Puppeteer)│  │ (tracker -- save)│  │
     │  └──────────┘  └────────────┘  └───────────────────┘  │
     └────────────────────────────────────────────────────────┘
                               │
              ┌────────────────▼─────────────────┐
              │  Postgres (Application table)     │
              │  + Nextcloud (CareerOps-Reports/) │
              └───────────────────────────────────┘
```

## Evaluation Flow (Single Offer)

1. **Input**: User pastes JD text or URL
2. **Extract**: Playwright/WebFetch extracts JD from URL
3. **Classify**: Detect archetype (1 of 6 types)
4. **Evaluate**: 6 blocks (A-F):
   - A: Role summary
   - B: CV match (gaps + mitigation)
   - C: Level strategy
   - D: Comp research (WebSearch)
   - E: CV personalization plan
   - F: Interview prep (STAR stories)
5. **Score**: Weighted average across 10 dimensions (1-5)
6. **Report**: Upload to Nextcloud (`CareerOps-Reports/{num}-{company}-{date}.md`)
7. **PDF**: Generate ATS-optimized CV (`npm run pdf`, `src/cli/pdf.ts`)
8. **Track**: Persist via `npm run tracker -- save` (uploads the report to Nextcloud and inserts the Postgres `Application` row)

## Batch Processing

The Claude Code batch system processes multiple offers in parallel:

```
batch-input.tsv    →  batch-runner.sh  →  N × claude -p workers
(id, url, source)     (orchestrator)       (self-contained prompt)
                           │
                    batch-state.tsv
                    (tracks progress)
```

Each worker is a headless Claude instance (`claude -p`) that receives the full `batch-prompt.md` as context. Workers produce:
- Report uploaded to Nextcloud (`CareerOps-Reports/`)
- PDF
- Postgres `Application` row via `npm run tracker -- save`

The orchestrator manages parallelism, state, retries, and resume.

For GitHub Copilot, `@batch` processes offers sequentially in chat/agent mode. The `.github/workflows/batch-evaluate.yml` workflow can collect JD artifacts in parallel for larger queues, but the final AI evaluation still runs through Copilot chat/agent mode.

## Data Flow

```
cv.md                    →  Evaluation context
article-digest.md        →  Proof points for matching
config/profile.yml       →  Candidate identity
portals.yml              →  Scanner configuration
templates/states.yml     →  Canonical status values
templates/cv-template.html → PDF generation template
```

## File Naming Conventions

- Reports: `{###}-{company-slug}-{YYYY-MM-DD}.md` (3-digit zero-padded), stored in Nextcloud (`CareerOps-Reports/`)
- PDFs: `cv-candidate-{company-slug}-{YYYY-MM-DD}.pdf`

## Pipeline Integrity

Scripts maintain data consistency:

| Script / Command | Purpose |
|--------|---------|
| `npm run tracker -- save` | Uploads the report to Nextcloud and inserts the Postgres `Application` row |
| `npm run tracker -- update` | Records status changes on an existing Postgres row |
| `npm run tracker -- list` | Lists tracked applications from Postgres (`--json` for machine output) |
| `verify-pipeline.mjs` | Health check: statuses, duplicates, links |
| `dedup-tracker.mjs` | Removes duplicate entries by company+role |
| `normalize-statuses.mjs` | Maps status aliases to canonical values |
