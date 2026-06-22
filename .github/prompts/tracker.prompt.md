---
description: "View application tracker stats, filter by status, and update application statuses. Use when user asks about pipeline status, application stats, or wants to update a status."
agent: "agent"
tools: [read, edit]
---

# Application Tracker

Read the full tracker instructions from `modes/tracker.md` and execute them.

## Quick Reference:

1. Read the tracker from Postgres via `npm run tracker -- list --json`
2. Parse all entries and compute:
   - Total applications
   - Count by status (Evaluated, Applied, Interview, etc.)
   - Average score, top score
   - % with PDF generated
   - Actionable count (score >= 4.0)
3. Display summary stats
4. Support filtering by status, company, or score range
5. Support status updates via `npm run tracker -- update` for existing entries

## Canonical States

See `templates/states.yml`:
Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP
