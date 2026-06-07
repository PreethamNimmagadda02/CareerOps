---
name: career-ops
description: 'AI job search command center — evaluate offers, generate CVs, scan portals, track applications. Use when: user mentions job search, offers, CV, applications, scanning, career pipeline.'
argument-hint: 'Command or paste a JD (e.g., "scan", "tracker", or a job URL)'
---

# career-ops — Command Router

## Available Commands

When invoked, determine the user's intent and delegate to the appropriate agent or prompt:

| User Intent | Delegate To |
|-------------|------------|
| Pastes a JD text or URL | @auto-pipeline agent |
| Says "evaluate", "score", "analyze offer" | @evaluator agent |
| Says "scan", "find jobs", "search portals" | @scanner agent |
| Says "pipeline", "process pending" | @pipeline agent |
| Says "batch", "process all" | @batch agent |
| Says "apply", "fill form" | @apply agent |
| Says "pdf", "generate cv" | /generate-pdf prompt |
| Says "outreach", "linkedin", "contact" | /outreach prompt |
| Says "compare", "rank offers" | /compare-offers prompt |
| Says "deep", "research company" | /deep-research prompt |
| Says "tracker", "status", "stats" | /tracker prompt |
| Says "training", "course", "cert" | /evaluate-training prompt |
| Says "project", "portfolio" | /evaluate-project prompt |

## Discovery Mode (no clear intent)

Show this menu:

```
career-ops — Command Center

Available commands:
  Paste a JD URL/text  → Full pipeline: evaluate + report + PDF + tracker
  scan                 → Scan portals and discover new offers
  pipeline             → Process pending URLs from inbox
  batch                → Batch process multiple offers
  evaluate             → Single offer A-F evaluation
  pdf                  → Generate ATS-optimized CV PDF
  apply                → Form-filling assistant
  outreach             → LinkedIn outreach messages
  compare              → Compare and rank multiple offers
  deep                 → Deep company research
  tracker              → Application status overview
  training             → Evaluate course/certification
  project              → Evaluate portfolio project idea

Inbox: add URLs to data/pipeline.md → run "pipeline" to process.
Or paste a JD directly to run the full pipeline.
```

## First Run — Setup Check

Before executing any command, verify these files exist:
1. `cv.md` — if missing, guide user to create it
2. `config/profile.yml` — if missing, copy from `config/profile.example.yml` and guide user
3. `modes/_profile.md` — if missing, copy from `modes/_profile.template.md`
4. `portals.yml` — if missing, copy from `templates/portals.example.yml`
5. `data/applications.md` — if missing, create with empty tracker table

If any are missing, enter onboarding mode (see `CLAUDE.md` onboarding section).
