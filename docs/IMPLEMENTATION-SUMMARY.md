# Career-Ops: Implementation Summary

> Generated: 2026-04-07 — Full system analysis and working documentation.

---

## 1. Project Overview

**Career-Ops** is an AI-powered job search pipeline built on **Claude Code** and **GitHub Copilot**. It automates offer evaluation (6-block A-F scoring), tailored ATS-optimized PDF generation, job portal scanning, batch processing, and application tracking.

**Tech Stack:**

| Layer | Technology |
|-------|-----------|
| AI Agent | Claude Code (modes, skills, slash commands) |
| Scripts | Node.js `.mjs` (ES Modules) |
| PDF Engine | Playwright (Chromium headless) → HTML template → PDF |
| Scanner | Playwright (browser automation) + WebSearch + API calls |
| Batch | `claude -p` pipe mode (headless parallel workers) |
| Persistence | Postgres (Prisma `Application` table) + Nextcloud (WebDAV `CareerOps-Reports/`) |
| Data Layer | Postgres rows, YAML config, Nextcloud-hosted reports |
| Config | YAML (profile, portals, states) |

### GitHub Copilot Compatibility Layer

The project now includes an additive Copilot layer:

| Layer | Files |
|-------|-------|
| Workspace guidance | `.github/copilot-instructions.md`, `AGENTS.md` |
| Custom agents | `.github/agents/*.agent.md` |
| Prompt files | `.github/prompts/*.prompt.md` |
| Instruction files | `.github/instructions/*.instructions.md` |
| Skill/router | `.github/skills/career-ops/SKILL.md` |
| Hooks and batch prep | `.github/hooks/*.json`, `.github/workflows/batch-evaluate.yml` |
| Validation | `node verify-copilot-migration.mjs` |

Copilot uses the same `modes/*.md`, `cv.md`, `config/profile.yml`, and pipeline data files as Claude Code. The main functional difference is batch processing: Claude Code can run `claude -p` workers, while Copilot performs AI evaluation in chat/agent mode and uses GitHub Actions only to collect JD artifacts for larger queues.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│   Claude Code Chat → Slash Commands (/career-ops {mode})        │
│   Tracker CLI (npm run tracker -- list) → pipeline browser      │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      MODE SYSTEM (13 modes)                     │
│   _shared.md (global context, scoring, archetypes, rules)       │
│   _profile.md (user customizations — NEVER auto-updated)        │
│   oferta.md │ scan.md │ pdf.md │ batch.md │ pipeline.md │ ...   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      AI TOOL LAYER                              │
│   Playwright (browser_navigate, browser_snapshot)               │
│   WebSearch (comp research, company info)                       │
│   WebFetch (API JSON, static pages)                             │
│   File I/O (Read/Write/Edit cv.md, reports, tracker)            │
│   Bash (node generate-pdf.mjs, pipeline scripts)                │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     DATA LAYER                                  │
│   cv.md (canonical CV)          config/profile.yml (identity)   │
│   article-digest.md (proofs)    portals.yml (scanner config)    │
│   Postgres (Application table)  data/pipeline.md (inbox)        │
│   data/scan-history.tsv         Nextcloud (CareerOps-Reports/)  │
│   output/*.pdf (generated CVs)  interview-prep/story-bank.md   │
│   templates/states.yml          templates/cv-template.html      │
│   batch/batch-state.tsv         (tracker CLI: npm run tracker)  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Contract (Two-Layer Safety)

| Layer | Files | Rule |
|-------|-------|------|
| **User Layer** | cv.md, config/profile.yml, modes/_profile.md, article-digest.md, portals.yml, data/*, Postgres (Application table), Nextcloud (CareerOps-Reports/), output/*, interview-prep/* | NEVER auto-updated; personalization goes here |
| **System Layer** | modes/_shared.md, all mode files, CLAUDE.md, *.mjs scripts, templates/*, batch/*, docs/* | Safe to auto-update; DON'T put user data here |

---

## 3. Mode System (13 Skill Modes)

Each mode is a self-contained markdown prompt that Claude Code loads when the user types `/career-ops {mode}`. The `_shared.md` global context is loaded BEFORE every mode.

| Mode | File | Purpose |
|------|------|---------|
| **auto-pipeline** | `modes/auto-pipeline.md` | Full pipeline: paste URL → evaluate → report → PDF → tracker |
| **oferta** | `modes/oferta.md` | Single offer evaluation (6-block A-F scoring) |
| **ofertas** | `modes/ofertas.md` | Compare multiple offers (10-dimension matrix) |
| **scan** | `modes/scan.md` | Portal scanner (3-level: Playwright → API → WebSearch) |
| **pipeline** | `modes/pipeline.md` | Process pending URLs from data/pipeline.md |
| **batch** | `modes/batch.md` | Parallel batch processing (10+ offers via `claude -p` workers) |
| **pdf** | `modes/pdf.md` | ATS-optimized PDF generation (13-step pipeline) |
| **apply** | `modes/apply.md` | Live form-filling assistant |
| **contacto** | `modes/contacto.md` | LinkedIn outreach message generator |
| **deep** | `modes/deep.md` | Deep company research (6-axis framework) |
| **tracker** | `modes/tracker.md` | Application status viewer + stats |
| **training** | `modes/training.md` | Course/certification evaluation |
| **project** | `modes/project.md` | Portfolio project evaluation |

### German Modes (`modes/de/`)

DACH-market-specific German translations: `_shared.md`, `angebot.md`, `bewerben.md`, `pipeline.md`.

---

## 4. Evaluation System (Core Logic)

### 6-Block Scoring (A-F)

Every offer evaluation produces exactly 6 blocks:

| Block | Name | What It Measures |
|-------|------|-----------------|
| **A** | Role Summary | Archetype detection, domain, function, seniority, remote, team size, TL;DR |
| **B** | CV Match | JD requirements vs CV lines, gaps analysis, mitigation plans |
| **C** | Level & Strategy | Seniority positioning, "sell senior" framing, downlevel contingency |
| **D** | Comp & Demand | Market salary data (WebSearch), company comp reputation, demand trends |
| **E** | CV Personalization | Top 5 CV changes + Top 5 LinkedIn changes for maximum match |
| **F** | Interview Prep | 6-10 STAR+R stories mapped to JD requirements, case study recommendation |

### Score Scale

| Score | Meaning | Action |
|-------|---------|--------|
| 4.5+ | Strong match | Apply immediately |
| 4.0–4.4 | Good match | Worth applying |
| 3.5–3.9 | Decent | Not ideal, proceed with caution |
| < 3.5 | Poor fit | Recommend against applying |

### 6 Archetypes

| # | Archetype | Detection Keywords |
|---|-----------|-------------------|
| 1 | AI Platform / LLMOps | observability, evals, pipelines, monitoring |
| 2 | Agentic / Automation | agent, HITL, orchestration, workflow |
| 3 | Technical AI PM | PRD, roadmap, discovery, stakeholder |
| 4 | AI Solutions Architect | architecture, enterprise, integration, design |
| 5 | AI Forward Deployed | client-facing, deploy, prototype, fast delivery |
| 6 | AI Transformation | change management, adoption, enablement |

---

## 5. Portal Scanner (3-Level Strategy)

| Level | Method | Reliability | Speed |
|-------|--------|------------|-------|
| **1 — Playwright** | Navigate to `careers_url`, snapshot DOM, extract listings | Highest (real-time, SPA-compatible) | Medium |
| **2 — API** | Greenhouse JSON API (`boards-api.greenhouse.io`) | High (structured data) | Fast |
| **3 — WebSearch** | `site:` filtered queries (Ashby, Greenhouse, Lever) | Medium (possibly cached) | Fast |

**Flow:** Execute all 3 levels → merge → dedup against scan-history.tsv + Postgres (`npm run tracker -- list --json`) + pipeline.md → filter by title keywords → add new offers to pipeline.md.

**Configuration:** `portals.yml` (45+ pre-configured companies: Anthropic, OpenAI, Mistral, ElevenLabs, Retool, Vercel, etc.)

---

## 6. PDF Generation (13-Step Pipeline)

1. Read cv.md (source of truth)
2. Extract 15-20 keywords from JD
3. Detect JD language → CV language
4. Detect location → paper format (US=letter, rest=A4)
5. Detect role archetype → adapt framing
6. Rewrite Professional Summary with keyword injection
7. Select top 3-4 relevant projects
8. Reorder work experience bullets by JD relevance
9. Build competency grid (6-8 keyword phrases)
10. Inject keywords naturally (**NEVER invent skills**)
11. Generate HTML from `templates/cv-template.html` with 23 placeholders
12. Write HTML to `/tmp/cv-candidate-{company}.html`
13. Execute `node generate-pdf.mjs` → output PDF

**Design:** Single-column ATS-friendly layout, Space Grotesk headers, DM Sans body, cyan/purple color scheme.

---

## 7. Batch Processing Architecture

```
Claude Conductor (claude --chrome)
  │
  ├─ Chrome: navigate portals, read DOM live
  │
  ├─ Offer 1 → claude -p worker (batch-prompt.md)
  │              → Nextcloud report + PDF + Postgres row (tracker -- save)
  │
  ├─ Offer 2 → claude -p worker
  │              → Nextcloud report + PDF + Postgres row (tracker -- save)
  │
  └─ Finish: npm run tracker -- save per offer → Postgres + Nextcloud
```

- **Conductor:** Uses `claude --chrome` to navigate portals and extract JDs in real-time
- **Workers:** Headless `claude -p` instances with `batch-prompt.md` as system prompt
- **State:** `batch/batch-state.tsv` tracks progress (completed/failed/pending)
- **Resumable:** Re-run skips completed items; lock file prevents double-execution
- **Standalone script:** `batch/batch-runner.sh` with `--parallel N`, `--retry-failed`, `--dry-run`

---

## 8. Node.js Utilities

| Script | Purpose | Key Logic |
|--------|---------|-----------|
| `generate-pdf.mjs` | HTML → PDF via Chromium | Playwright headless, font resolution, page counting |
| `npm run tracker -- save` | Report → Nextcloud + Postgres row | Uploads to `CareerOps-Reports/`, inserts `Application` row, status validation |
| `npm run tracker -- update` | Status change on existing row | Updates Postgres `Application` status/notes |
| `npm run tracker -- list` | List tracked applications | Reads Postgres (`--json` for machine output) |
| `dedup-tracker.mjs` | Remove duplicates | Group by normalized company+role, keep highest score |
| `verify-pipeline.mjs` | Health check (7 checks) | Status validation, report links, score format |
| `normalize-statuses.mjs` | Map aliases to canonical | DUPLICADO→Discarded, Cerrada→Discarded, etc. |
| `update-system.mjs` | Safe auto-updater | Git-based, backup branch, user files NEVER touched |

---

## 9. Tracker CLI (Pipeline Browser)

Applications live in Postgres (Prisma `Application` table) and reports live in Nextcloud (`CareerOps-Reports/`). The tracker CLI (`src/cli/tracker.ts`) is the single interface for persisting and browsing the pipeline.

| Command | Purpose |
|---------|---------|
| `npm run tracker -- save` | Upload the report to Nextcloud and insert the Postgres `Application` row |
| `npm run tracker -- add` | Insert a new Postgres `Application` row (no report upload) |
| `npm run tracker -- update` | Update status/notes on an existing Postgres row |
| `npm run tracker -- list` | List tracked applications from Postgres (`--json` for machine output) |

**Features:** Filter by status, sort by score/date/company, and query report links directly from Postgres; reports are fetched from Nextcloud on demand.

---

## 10. Canonical States

Source: `templates/states.yml`

| State | Aliases | When to Use |
|-------|---------|-------------|
| Evaluated | evaluada | Report completed, pending decision |
| Applied | aplicado, enviada, sent | Application submitted |
| Responded | respondido | Company responded |
| Interview | entrevista | In interview process |
| Offer | oferta | Offer received |
| Rejected | rechazado, rechazada | Rejected by company |
| Discarded | descartado, cerrada, cancelada | Discarded by candidate or closed |
| SKIP | no_aplicar, monitor | Doesn't fit, don't apply |

---

## 11. Onboarding Flow

6-step guided setup when files are missing:

1. **CV** — Create `cv.md` (paste, LinkedIn URL, or tell experience)
2. **Profile** — Fill `config/profile.yml` (name, email, location, target roles, salary)
3. **Portals** — Copy `portals.yml` from template, customize keywords
4. **Tracker** — Provision Postgres (Prisma `Application` table) and Nextcloud (`CareerOps-Reports/`) credentials
5. **Deep Learning** — Proactive questions about superpowers, deal-breakers, achievements
6. **Ready** — Confirm setup, suggest automation (recurring scans)

---

## 12. Claude Code–Specific Dependencies

| Feature | Claude Code Mechanism | Portable? |
|---------|----------------------|-----------|
| Slash command modes | `/career-ops {mode}` → loads modes/*.md | **NO** — Claude Code specific |
| Pipe mode workers | `claude -p` headless agents | **NO** — Claude Code specific |
| Chrome conductor | `claude --chrome` real-time browser | **NO** — Claude Code specific |
| Playwright tools | `browser_navigate` + `browser_snapshot` | Partially — via standalone Playwright |
| WebSearch tool | Built-in Claude Code tool | **NO** — needs external API |
| WebFetch tool | Built-in Claude Code tool | Partially — standard HTTP client |
| Agent parallelism | `Agent(subagent_type=..., run_in_background=True)` | **NO** — Claude Code specific |
| File Read/Write/Edit | Built-in Claude Code tools | Yes — standard filesystem |
| Bash execution | Built-in Claude Code tool | Yes — standard shell |
| Prompt inheritance | _shared.md loaded before all modes | **NO** — needs explicit chaining |
| Update checker | `node update-system.mjs check` on session start | Yes — CLI script |
| Mode language detection | Auto-detect JD language → mode language | Yes — logic portable |

---

## 13. File Tree Summary

```
Career-ops/
├── CLAUDE.md                          # Master agent instructions
├── DATA_CONTRACT.md                   # User vs system layer rules
├── VERSION                            # Current version (1.1.0)
├── package.json                       # Node deps (playwright)
├── cv.md                              # [USER] Canonical CV
├── article-digest.md                  # [USER] Proof points (optional)
├── portals.yml                        # [USER] Scanner config
│
├── config/
│   ├── profile.example.yml            # Template for profile
│   └── profile.yml                    # [USER] Candidate identity
│
├── modes/
│   ├── _shared.md                     # Global scoring, archetypes, rules
│   ├── _profile.template.md           # Template for user customizations
│   ├── _profile.md                    # [USER] Personal overrides
│   ├── auto-pipeline.md               # Full auto-pipeline mode
│   ├── oferta.md                      # Single offer evaluation
│   ├── ofertas.md                     # Multi-offer comparison
│   ├── scan.md                        # Portal scanner
│   ├── pipeline.md                    # Process pending URLs
│   ├── batch.md                       # Batch processing
│   ├── pdf.md                         # PDF generation
│   ├── apply.md                       # Form-filling assistant
│   ├── contacto.md                    # LinkedIn outreach
│   ├── deep.md                        # Company research
│   ├── tracker.md                     # Status viewer
│   ├── training.md                    # Course evaluation
│   ├── project.md                     # Project evaluation
│   └── de/                            # German modes (DACH market)
│
├── data/
│   ├── pipeline.md                    # [USER] Pending URLs inbox
│   └── scan-history.tsv               # [USER] Scanner dedup
│
│   # Applications → Postgres (Prisma Application table)
│   # Reports      → Nextcloud (WebDAV CareerOps-Reports/)
├── output/                            # [USER] Generated PDFs
├── jds/                               # [USER] Saved JD texts
├── interview-prep/
│   └── story-bank.md                  # [USER] STAR+R stories
│
├── templates/
│   ├── cv-template.html               # PDF HTML template (23 placeholders)
│   ├── states.yml                     # Canonical status definitions
│   └── portals.example.yml            # Portal config template (45+ companies)
│
├── batch/
│   ├── batch-prompt.md                # Self-contained worker prompt
│   ├── batch-runner.sh                # Orchestrator script
│   └── logs/                          # Worker logs
│
├── fonts/                             # Space Grotesk + DM Sans
│
├── *.mjs                              # Pipeline utilities
│
└── docs/
    ├── ARCHITECTURE.md
    ├── CUSTOMIZATION.md
    └── SETUP.md
```

---

## 14. Ethical Guidelines

- **NEVER** submit applications without user review (fill forms but STOP before Submit)
- **NEVER** invent experience or metrics
- **Strongly discourage** applications with score < 4.0
- **Quality over quantity** — 5 targeted applications > 50 generic blasts
- **Respect recruiters' time** — only send what's worth reading
- **Always verify** offers are still active via Playwright before full evaluation
