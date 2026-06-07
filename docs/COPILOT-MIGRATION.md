# Career-Ops: Claude Code → GitHub Copilot Migration

> Migration guide and implementation documentation for running Career-Ops with GitHub Copilot instead of Claude Code.

---

## Current Status

The migration is implemented as an additive compatibility layer. Claude Code support remains intact, and GitHub Copilot support now lives in `.github/` plus the workspace settings in `.vscode/settings.json`.

Important limitation: Copilot can run the repo's agents and prompts in VS Code, but GitHub Actions cannot perform Copilot chat reasoning by itself. The workflow in `.github/workflows/batch-evaluate.yml` therefore prepares JD artifacts for batch work; final AI evaluation still happens through Copilot chat/agent mode or Claude Code.

---

## Table of Contents

1. [Why Migrate](#1-why-migrate)
2. [Architecture Comparison](#2-architecture-comparison)
3. [What Was Migrated](#3-what-was-migrated)
4. [Mapping: Claude Code → Copilot Primitives](#4-mapping-claude-code--copilot-primitives)
5. [New File Structure](#5-new-file-structure)
6. [How Each Mode Was Converted](#6-how-each-mode-was-converted)
7. [What Changed and Why](#7-what-changed-and-why)
8. [Batch Processing: The Biggest Change](#8-batch-processing-the-biggest-change)
9. [How to Use Career-Ops with Copilot](#9-how-to-use-career-ops-with-copilot)
10. [Limitations and Workarounds](#10-limitations-and-workarounds)
11. [What Stayed the Same](#11-what-stayed-the-same)
12. [Dual-Mode Support](#12-dual-mode-support)

---

## 1. Why Migrate

Career-Ops was built on **Claude Code**, which provides:
- Slash command modes (`/career-ops {mode}`)
- Headless pipe workers (`claude -p`) for parallel batch processing
- Chrome conductor mode (`claude --chrome`) for real-time browser control
- Built-in WebSearch, WebFetch, Playwright tools
- Agent parallelization via `Agent()` subagents
- Prompt inheritance (modes read `_shared.md` automatically)

**GitHub Copilot** offers a different but powerful customization system:
- Custom agents (`.agent.md`) — specialized personas with tool restrictions
- Prompts (`.prompt.md`) — single focused tasks, triggered via `/` in chat
- Skills (`SKILL.md`) — multi-step workflows with bundled assets
- Instructions (`.instructions.md`) — context loaded on-demand or by file pattern
- Hooks (`.json`) — Copilot CLI/coding-agent lifecycle automation
- Workspace instructions (`copilot-instructions.md`) — always-on project guidelines
- MCP servers for external tool integration

The migration preserves all career-ops functionality while adapting to Copilot's architecture.

---

## 2. Architecture Comparison

### Before (Claude Code)

```
User → /career-ops {mode} → Claude Code loads modes/{mode}.md
                           → _shared.md auto-loaded first
                           → Tools: Playwright, WebSearch, WebFetch, Read, Write, Bash
                           → Batch: claude -p parallel workers
                           → Conductor: claude --chrome real-time browser
```

### After (GitHub Copilot)

```
User → @agent or /prompt → Copilot loads .agent.md or .prompt.md
                          → .instructions.md loaded on-demand
                          → copilot-instructions.md always loaded
                          → Tools: web, read, edit, execute, search, agent
                          → Batch: Sequential + GitHub Actions JD collection
                          → Scanning: web tool (fetch URLs + search)
```

### Key Differences

| Feature | Claude Code | GitHub Copilot |
|---------|------------|----------------|
| Mode system | `/career-ops {mode}` | `@agent` or `/prompt` |
| Prompt inheritance | `_shared.md` auto-loaded | `.instructions.md` on-demand |
| Batch parallelism | `claude -p` pipe workers | Sequential + GitHub Actions JD collection |
| Browser control | `claude --chrome` + Playwright | `web` tool (fetch + search) |
| Web search | Built-in `WebSearch` tool | Built-in `web` tool alias |
| Subagents | `Agent()` with background | `agent` tool with subagent delegation |
| Lifecycle hooks | Session start checks | `.github/hooks/*.json` for Copilot CLI/coding-agent contexts |

---

## 3. What Was Migrated

### Created Files

| File | Type | Replaces |
|------|------|----------|
| `.github/copilot-instructions.md` | Workspace instructions | `CLAUDE.md` (subset) |
| `.github/agents/evaluator.agent.md` | Custom agent | `modes/oferta.md` |
| `.github/agents/auto-pipeline.agent.md` | Custom agent | `modes/auto-pipeline.md` |
| `.github/agents/scanner.agent.md` | Custom agent | `modes/scan.md` |
| `.github/agents/pipeline.agent.md` | Custom agent | `modes/pipeline.md` |
| `.github/agents/batch.agent.md` | Custom agent | `modes/batch.md` |
| `.github/agents/apply.agent.md` | Custom agent | `modes/apply.md` |
| `.github/prompts/generate-pdf.prompt.md` | Prompt | `modes/pdf.md` |
| `.github/prompts/outreach.prompt.md` | Prompt | `modes/contacto.md` |
| `.github/prompts/deep-research.prompt.md` | Prompt | `modes/deep.md` |
| `.github/prompts/compare-offers.prompt.md` | Prompt | `modes/ofertas.md` |
| `.github/prompts/tracker.prompt.md` | Prompt | `modes/tracker.md` |
| `.github/prompts/evaluate-training.prompt.md` | Prompt | `modes/training.md` |
| `.github/prompts/evaluate-project.prompt.md` | Prompt | `modes/project.md` |
| `.github/instructions/shared-context.instructions.md` | Instruction | `modes/_shared.md` reference |
| `.github/instructions/pipeline-data.instructions.md` | Instruction | Pipeline conventions |
| `.github/skills/career-ops/SKILL.md` | Skill | `.claude/skills/career-ops/SKILL.md` |
| `.github/hooks/career-ops-session.json` | Copilot hook | Session-start checks from CLAUDE.md for Copilot CLI/coding-agent contexts |
| `.github/workflows/batch-evaluate.yml` | GitHub Actions | JD artifact collection for Copilot-guided batch work |

### Preserved Files (No Changes)

All original files remain intact. The migration is **additive** — it creates new `.github/` files alongside the existing `modes/`, `CLAUDE.md`, and `.claude/` directory. The project works with both Claude Code and Copilot.

---

## 4. Mapping: Claude Code → Copilot Primitives

### Conceptual Mapping

| Claude Code Concept | Copilot Equivalent | Rationale |
|--------------------|-------------------|-----------|
| `CLAUDE.md` | `copilot-instructions.md` | Both are always-on workspace instructions |
| `modes/{mode}.md` (complex) | `.github/agents/{name}.agent.md` | Multi-step workflows need agent's tool access |
| `modes/{mode}.md` (simple) | `.github/prompts/{name}.prompt.md` | Focused single tasks map to prompts |
| `modes/_shared.md` | `.github/instructions/shared-context.instructions.md` | On-demand context, loaded when relevant |
| `.claude/skills/career-ops/SKILL.md` | `.github/skills/career-ops/SKILL.md` | Same concept, different location |
| Session-start checks | `.github/hooks/career-ops-session.json` | Copilot CLI/coding-agent hook schema |
| `claude -p` workers | `@batch` plus GitHub Actions JD collection | Copilot reasoning stays in chat/agent mode; Actions prepares inputs |
| `Agent()` subagent | `agent` tool alias | Similar subagent delegation |

### Tool Mapping

| Claude Code Tool | Copilot Equivalent | Notes |
|-----------------|-------------------|-------|
| `WebSearch` | `web` tool alias | Web search capability |
| `WebFetch` | `web` tool alias | URL fetching capability |
| `browser_navigate` + `browser_snapshot` | `web` tool alias | Fetch URL content; no real-time browser control |
| `Read` (file) | `read` tool alias | File reading |
| `Write` (file) | `edit` tool alias | File creation/editing |
| `Edit` (file) | `edit` tool alias | File modification |
| `Bash` | `execute` tool alias | Shell command execution |
| `Agent()` | `agent` tool alias | Subagent invocation |

---

## 5. New File Structure

```
.github/
├── copilot-instructions.md              # Always-on workspace guidelines
├── agents/
│   ├── evaluator.agent.md               # Single offer A-F evaluation
│   ├── auto-pipeline.agent.md           # Full pipeline: JD → report → PDF → tracker
│   ├── scanner.agent.md                 # Portal scanning (3-level discovery)
│   ├── pipeline.agent.md                # Process pending URLs from inbox
│   ├── batch.agent.md                   # Sequential batch processing
│   └── apply.agent.md                   # Form-filling assistant
├── prompts/
│   ├── generate-pdf.prompt.md           # ATS-optimized PDF generation
│   ├── outreach.prompt.md               # LinkedIn outreach messages
│   ├── deep-research.prompt.md          # Deep company research
│   ├── compare-offers.prompt.md         # Multi-offer comparison
│   ├── tracker.prompt.md                # Application status viewer
│   ├── evaluate-training.prompt.md      # Course/cert evaluation
│   └── evaluate-project.prompt.md       # Portfolio project evaluation
├── instructions/
│   ├── shared-context.instructions.md   # Scoring, archetypes, rules (on-demand)
│   └── pipeline-data.instructions.md    # Tracker/report conventions
├── skills/
│   └── career-ops/
│       └── SKILL.md                     # Main entry point / router
├── hooks/
│   └── career-ops-session.json          # Copilot CLI/coding-agent session-start checks
└── workflows/
    └── batch-evaluate.yml               # GitHub Actions JD collection for batch processing
```

---

## 6. How Each Mode Was Converted

### Complex Modes → Custom Agents

These modes involve multi-step workflows, multiple tool calls, and subagent delegation. They need the full agent capability.

| Mode | Agent | Why Agent? |
|------|-------|-----------|
| `oferta.md` | `evaluator.agent.md` | 6-block evaluation, web search, file I/O, report generation |
| `auto-pipeline.md` | `auto-pipeline.agent.md` | Orchestrates evaluation + PDF + tracker, delegates to other agents |
| `scan.md` | `scanner.agent.md` | 3-level discovery, web fetch, file updates |
| `pipeline.md` | `pipeline.agent.md` | Iterates URLs, delegates per-URL to auto-pipeline |
| `batch.md` | `batch.agent.md` | Multi-offer processing, state management |
| `apply.md` | `apply.agent.md` | Interactive form-filling, reads reports/CV |

### Simple Modes → Prompts

These modes are focused tasks that produce a single output. They work well as prompts.

| Mode | Prompt | Why Prompt? |
|------|--------|------------|
| `pdf.md` | `generate-pdf.prompt.md` | Single focused task: generate PDF from JD |
| `contacto.md` | `outreach.prompt.md` | Single output: LinkedIn messages |
| `deep.md` | `deep-research.prompt.md` | Single output: research report |
| `ofertas.md` | `compare-offers.prompt.md` | Single output: comparison matrix |
| `tracker.md` | `tracker.prompt.md` | Single output: stats display |
| `training.md` | `evaluate-training.prompt.md` | Single output: course verdict |
| `project.md` | `evaluate-project.prompt.md` | Single output: project verdict |

### Decision Criteria

```
Does the mode need to:
  ├── Invoke other agents/modes? → Agent
  ├── Make web requests + file edits? → Agent
  ├── Iterate over multiple items? → Agent
  └── Produce a single focused output? → Prompt
```

---

## 7. What Changed and Why

### 1. Mode Loading → Explicit File References

**Before (Claude Code):** Modes auto-inherit `_shared.md`. When you run `/career-ops oferta`, Claude Code automatically loads `_shared.md` first, then `oferta.md`.

**After (Copilot):** Each agent/prompt explicitly references the files it needs via markdown links:
```markdown
1. [modes/_shared.md](../../modes/_shared.md) — scoring system
2. [cv.md](../../cv.md) — canonical CV
```

**Why:** Copilot doesn't have prompt inheritance. Explicit references are more transparent and let each agent declare its own dependencies.

### 2. Slash Commands → Agent Picker + Slash Prompts

**Before:** `/career-ops scan`, `/career-ops oferta`, `/career-ops pdf`

**After:**
- Agents appear in the agent picker (click `@` in chat or type `@scanner`)
- Prompts appear as slash commands (type `/` then select `/generate-pdf`)
- The career-ops skill (`/career-ops`) acts as a router

**Why:** Copilot uses `@agent` for complex tasks and `/prompt` for simple tasks. This maps naturally to the complex/simple mode split.

### 3. WebSearch/WebFetch/Playwright → `web` Tool

**Before:** Separate tools: `WebSearch` (search), `WebFetch` (fetch URL), `browser_navigate`/`browser_snapshot` (Playwright).

**After:** Copilot's built-in `web` tool alias handles URL fetching and web search.

**Limitation:** No real-time browser control. SPA-heavy career pages (Workday, Ashby) may not render properly with simple fetching. Workarounds:
- Use Greenhouse API (Level 2 scanning) where available
- Ask user to paste JD text if fetch fails
- Use MCP servers for Playwright integration (optional advanced setup)

### 4. `claude -p` Workers → Sequential Agents + JD Collection

**Before:** Parallel headless workers via `claude -p` pipe mode.

**After:** Two options:
1. **Sequential processing** (in Copilot chat): The batch agent processes offers one at a time
2. **GitHub Actions workflow** (parallel input prep): `batch-evaluate.yml` fetches JDs and uploads artifacts for Copilot-guided evaluation

**Why:** `claude -p` is Claude Code-specific. GitHub Actions can parallelize deterministic input preparation, but Copilot's reasoning still runs in Copilot chat/agent mode.

### 5. `Agent()` Subagents → `agent` Tool Alias

**Before:** `Agent(subagent_type="general-purpose", prompt="...", run_in_background=True)`

**After:** Copilot agents can invoke other agents via the `agent` tool alias. Agents list allowed subagents in their `agents:` frontmatter field.

### 6. Session-Start Checks → Copilot Hooks

**Before:** CLAUDE.md instructs "on first message, run `node update-system.mjs check`"

**After:** `.github/hooks/career-ops-session.json` uses the Copilot hooks schema (`version: 1`, `hooks.sessionStart[]`) to run the update check and sync check in Copilot CLI/coding-agent contexts. VS Code chat users can run the same checks manually with `node update-system.mjs check` and `node cv-sync-check.mjs`.

---

## 8. Batch Processing: The Biggest Change

The most significant difference between Claude Code and Copilot for career-ops is batch processing.

### Claude Code Batch Architecture

```
claude --chrome (Conductor)
   ├── Navigate portal in Chrome
   ├── Extract JDs from DOM
   └── For each offer:
       └── claude -p worker (parallel, headless)
           ├── Read batch-prompt.md
           ├── Evaluate A-F
           ├── Generate PDF
           └── Write TSV
```

- **Parallelism**: True parallel — multiple `claude -p` instances
- **Browser**: Real Chrome with DOM access
- **Speed**: 3-5 offers simultaneously
- **Limitation**: Expensive (each worker is a full API session)

### Copilot Batch Architecture

**Option A: Sequential (in chat)**
```
@batch agent
   └── For each offer (one at a time):
       ├── Fetch JD via web tool
       ├── Evaluate A-F
       ├── Generate PDF
       └── Write TSV
```

- **Parallelism**: None (sequential)
- **Browser**: URL fetching only
- **Speed**: 1 offer at a time
- **Advantage**: No infrastructure needed

**Option B: GitHub Actions (parallel JD collection)**
```
batch-evaluate.yml workflow
   ├── prepare job: Parse pipeline.md → matrix
   ├── collect jobs (max-parallel: 3):
   │   ├── Job 1: Fetch JD artifact for offer 1
   │   ├── Job 2: Fetch JD artifact for offer 2
   │   └── Job 3: Fetch JD artifact for offer 3
   └── summary job: Upload artifacts and run verification
```

- **Parallelism**: Up to 3 concurrent jobs
- **Browser**: Node.js fetch (basic) or Playwright (full)
- **Speed**: 3 JDs collected simultaneously
- **Limitation**: Requires GitHub repo + Actions minutes; does not perform Copilot reasoning inside Actions

### Recommendation

For **<5 offers**: Use sequential (Option A) in Copilot chat.
For **5+ offers**: Use GitHub Actions (Option B) to collect JD artifacts, then ask `@batch` to evaluate the artifacts.
For **portal scanning + evaluation**: Use @scanner first (to fill pipeline), then @batch or Actions.

---

## 9. How to Use Career-Ops with Copilot

### Setup

1. Open the project in VS Code
2. Ensure GitHub Copilot extension is installed and active
3. Keep `.vscode/settings.json` enabled so prompt files, instruction files, and `AGENTS.md` are loaded
4. Files are already in place — no additional setup needed

### Quick Start

| Task | How to Invoke |
|------|--------------|
| Evaluate an offer | Paste JD URL in chat (auto-pipeline triggers) |
| Scan for new offers | Type `@scanner` in chat |
| Generate PDF | Type `/generate-pdf` in chat |
| View tracker stats | Type `/tracker` in chat |
| Process pending URLs | Type `@pipeline` in chat |
| Compare offers | Type `/compare-offers` in chat |
| LinkedIn outreach | Type `/outreach` in chat |
| Deep company research | Type `/deep-research` in chat |
| Fill application form | Type `@apply` in chat |
| Batch process | Type `@batch` or run GitHub Actions |
| Evaluate a course | Type `/evaluate-training` in chat |
| Evaluate a project | Type `/evaluate-project` in chat |
| See all commands | Type `/career-ops` in chat |

### Example Workflows

**Evaluate a single offer:**
```
You: @evaluator https://jobs.lever.co/company/role-id
→ Copilot reads JD, evaluates A-F, saves report, generates PDF, updates tracker
```

**Scan and process pipeline:**
```
You: @scanner
→ Copilot scans portals, adds new offers to pipeline.md

You: @pipeline
→ Copilot processes each pending URL through full evaluation
```

**Batch via GitHub Actions:**
```
You: Can you trigger the batch workflow?
→ Execute: gh workflow run batch-evaluate.yml --field max_offers=10
→ Actions collects JD artifacts; then ask @batch to evaluate those artifacts
```

---

## 10. Limitations and Workarounds

### No Real-Time Browser Control

**Claude Code** can navigate pages in real Chrome, see DOM, click buttons.
**Copilot** fetches URL content but can't interact with SPAs.

**Workarounds:**
- Use Greenhouse API for Greenhouse-hosted jobs (structured JSON)
- Ask user to paste JD text when URL fetch fails
- Set up a Playwright MCP server for full browser automation (advanced)
- Add a `fetch-jd.mjs` utility script that uses Playwright headlessly

### No Pipe Mode for Batch

**Claude Code** runs headless `claude -p` workers in parallel.
**Copilot** processes sequentially in chat/agent mode. GitHub Actions can collect inputs in parallel, but it does not run Copilot chat reasoning by itself.

**Workarounds:**
- Use GitHub Actions for parallel JD collection
- Accept sequential processing for small batches (<5 offers)
- Consider a scheduled GitHub Actions workflow for recurring scans

### Prompt Inheritance

**Claude Code** auto-loads `_shared.md` before every mode.
**Copilot** requires explicit file references in each agent/prompt.

**Workarounds:**
- Each agent references `_shared.md` explicitly
- The `shared-context.instructions.md` is loaded on-demand by Copilot when relevant
- The skill router (career-ops SKILL.md) mentions setup checks

### No Background Agents

**Claude Code** can run `Agent(... run_in_background=True)`.
**Copilot** subagents don't run in background.

**Workaround:**
- Process tasks sequentially
- Use GitHub Actions for tasks that benefit from parallelism

---

## 11. What Stayed the Same

These components are completely unchanged and work identically:

| Component | Why Unchanged |
|-----------|--------------|
| All `.mjs` scripts | CLI utilities — agent-agnostic |
| `cv.md`, `config/profile.yml` | Data files — no agent dependency |
| `data/applications.md`, `pipeline.md` | Data files — markdown tables |
| `reports/`, `output/` | Output directories |
| `templates/cv-template.html` | HTML template — pure markup |
| `templates/states.yml` | Config file — YAML |
| `portals.yml` | Config file — YAML |
| Dashboard TUI (Go) | Standalone binary |
| `modes/*.md` | Preserved for Claude Code compatibility |
| `.claude/` directory | Preserved for Claude Code compatibility |
| `CLAUDE.md` | Preserved for Claude Code compatibility |
| `batch/batch-prompt.md` | Worker prompt — still usable with external orchestration |

---

## 12. Dual-Mode Support

This migration is **additive**, not destructive. The project now supports **both** Claude Code and GitHub Copilot:

```
Career-ops/
├── CLAUDE.md                    # Claude Code instructions (preserved)
├── .claude/                     # Claude Code skills (preserved)
│   └── skills/career-ops/
├── modes/                       # Mode files (shared by both)
│
├── .github/                     # Copilot customizations (NEW)
│   ├── copilot-instructions.md  # Workspace instructions
│   ├── agents/                  # Custom agents
│   ├── prompts/                 # Prompt templates
│   ├── instructions/            # On-demand context
│   ├── skills/                  # Skill entry points
│   ├── hooks/                   # Copilot CLI/coding-agent automation
│   └── workflows/               # GitHub Actions JD collection
```

**Using Claude Code:** Everything works as before via `CLAUDE.md` and `.claude/`.
**Using Copilot:** The `.github/` directory provides all the Copilot customizations.

Both systems read the same `modes/*.md` files, `cv.md`, `config/profile.yml`, and all data files. The agents/prompts in `.github/` explicitly reference the mode files for their detailed instructions, so the source of truth is shared.

---

## Appendix: Claude Code → Copilot Quick Reference Card

| I want to... | Claude Code | GitHub Copilot |
|-------------|------------|----------------|
| Evaluate an offer | `/career-ops oferta` | `@evaluator` |
| Full pipeline | Paste JD (auto-detected) | Paste JD (auto-detected via @auto-pipeline) |
| Scan portals | `/career-ops scan` | `@scanner` |
| Generate PDF | `/career-ops pdf` | `/generate-pdf` |
| Process inbox | `/career-ops pipeline` | `@pipeline` |
| Batch process | `/career-ops batch` | `@batch`; use GitHub Actions to collect JD artifacts |
| Fill application | `/career-ops apply` | `@apply` |
| LinkedIn outreach | `/career-ops contacto` | `/outreach` |
| Compare offers | `/career-ops ofertas` | `/compare-offers` |
| Deep research | `/career-ops deep` | `/deep-research` |
| View tracker | `/career-ops tracker` | `/tracker` |
| Evaluate course | `/career-ops training` | `/evaluate-training` |
| Evaluate project | `/career-ops project` | `/evaluate-project` |
| See all commands | `/career-ops` | `/career-ops` |
