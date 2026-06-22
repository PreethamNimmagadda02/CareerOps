# Mode: oferta — Full A-F Evaluation

When the candidate pastes a role (text or URL), ALWAYS deliver all 6 blocks:

## Step 0 — Archetype Detection

Classify the role into one of the 6 archetypes (see `_shared.md`). If it's a hybrid, indicate the 2 closest. This determines:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role Summary

Table with:
- Detected archetype
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- TL;DR in 1 sentence

## Block B — CV Match

Read `cv.md`. Create a table mapping each JD requirement to exact lines in the CV.

**Adapted to the archetype:**
- If FDE → prioritize fast-delivery and client-facing proof points
- If SA → prioritize systems design and integrations
- If PM → prioritize product discovery and metrics
- If LLMOps → prioritize evals, observability, pipelines
- If Agentic → prioritize multi-agent, HITL, orchestration
- If Transformation → prioritize change management, adoption, scaling

A **gaps** section with a mitigation strategy for each one. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project that covers this gap?
4. Concrete mitigation plan (cover letter sentence, quick project, etc.)

## Block C — Level and Strategy

1. **Level detected** in the JD vs **the candidate's natural level for that archetype**
2. **"Sell senior without lying" plan**: archetype-specific phrasing, concrete achievements to highlight, how to position founder experience as an advantage
3. **"If I get downleveled" plan**: accept if comp is fair, negotiate a 6-month review, clear promotion criteria

## Block D — Comp and Demand

Use WebSearch for:
- Current salaries for the role (Glassdoor, Levels.fyi, Blind)
- The company's compensation reputation
- Demand trend for the role

A table with data and cited sources. If there's no data, say so instead of inventing.

## Block E — Personalization Plan

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 changes to the CV + Top 5 changes to LinkedIn to maximize the match.

## Block F — Interview Plan

6-10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD requirement | STAR+R story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Selected and framed according to the archetype:**
- FDE → emphasize delivery speed and client-facing
- SA → emphasize architecture decisions
- PM → emphasize discovery and trade-offs
- LLMOps → emphasize metrics, evals, production hardening
- Agentic → emphasize orchestration, error handling, HITL
- Transformation → emphasize adoption, organizational change

Also include:
- 1 recommended case study (which of their projects to present and how)
- Red-flag questions and how to answer them (e.g.: "why did you sell your company?", "do you have a team of reports?")

---

## Post-evaluation

**ALWAYS** after generating blocks A-F: persist to **Postgres + Nextcloud** with a single command. NEVER write `data/applications.md` or files in `reports/`.

### 1. Write the report body to a temporary file

Write ONLY the A–G body (no header — the CLI adds the canonical header) to `/tmp/eval.md`:

```markdown
## A) Role Summary
(full content of block A)

## B) CV Match
(full content of block B)

## C) Level and Strategy
(full content of block C)

## D) Comp and Demand
(full content of block D)

## E) Personalization Plan
(full content of block E)

## F) Interview Plan
(full content of block F)

## G) Draft Application Answers
(only if score >= 4.5 — draft answers for the application form)

---

## Extracted keywords
(list of 15-20 keywords from the JD for ATS optimization)
```

### 2. Save the report (Nextcloud) + register the application (Postgres)

Run the `save` command, which uploads the report to Nextcloud, inserts the row in Postgres, and links both:

```bash
npm run tracker -- save \
  --company "{Company}" \
  --role "{Role}" \
  --url "{JD URL}" \
  --score {X.X} \
  --status Evaluated \
  --pdf "{❌ or ✅ if auto-pipeline generated a PDF}" \
  --provider "manual" \
  --file /tmp/eval.md
```

The CLI assigns the sequential number, generates `{###}-{company-slug}-{YYYY-MM-DD}.md` in Nextcloud (`CareerOps-Reports/`), and creates the row with: date, company, role, score, `Evaluated` status, PDF, and the link to the report. There are no local markdown files.
