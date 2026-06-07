---
description: "Use when evaluating job offers, generating CVs, scanning portals, or any career-ops operation. Contains scoring system, archetypes, and global rules."
applyTo: "**"
---

# Shared Context for Career-Ops Operations

This instruction file provides the global context needed for all career-ops operations.

## Loading Order

Before any evaluation or generation task, read these files:
1. `modes/_shared.md` — Full scoring system, 6 archetypes, global rules, tool usage
2. `modes/_profile.md` — User customizations that override _shared.md (if exists)
3. `cv.md` — Canonical CV (NEVER modify)
4. `article-digest.md` — Detailed proof points from portfolio (if exists)
5. `config/profile.yml` — Candidate identity, target roles, comp targets

## Score Scale Quick Reference

| Score | Meaning | Action |
|-------|---------|--------|
| 4.5+ | Strong match | Apply immediately |
| 4.0–4.4 | Good match | Worth applying |
| 3.5–3.9 | Decent | Proceed with caution |
| < 3.5 | Poor fit | Recommend against |

## 6 Archetypes

1. AI Platform / LLMOps
2. Agentic / Automation
3. Technical AI PM
4. AI Solutions Architect
5. AI Forward Deployed
6. AI Transformation

## Critical Rules

- NEVER invent experience or metrics
- NEVER hardcode data — read from cv.md at evaluation time
- NEVER submit applications without user review
- ALWAYS cite exact CV lines when matching
- ALWAYS use web search for comp research
- ALWAYS write tracker additions as TSV (never edit applications.md directly for new entries)
