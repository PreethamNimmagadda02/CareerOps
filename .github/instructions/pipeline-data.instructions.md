---
description: "Use when working with pipeline data: the Postgres Application table, pipeline.md, scan-history.tsv, or batch state files."
applyTo: "data/**, batch/**"
---

# Pipeline Data Conventions

## Tracker (Postgres `Application` table)

- To ADD new entries, use `npm run tracker -- save` (uploads the report to Nextcloud and inserts the Postgres `Application` row)
- To UPDATE existing entries (status, notes), use `npm run tracker -- update`
- To READ the tracker, use `npm run tracker -- list` (`--json` for machine output)
- Status must be canonical (see templates/states.yml)

## Report Naming

Format: `{###}-{company-slug}-{YYYY-MM-DD}.md` (stored in Nextcloud `CareerOps-Reports/`)
- `###` = next sequential number (3-digit zero-padded, max existing + 1)
- `company-slug` = company name lowercase, hyphens instead of spaces
- All reports MUST include `**URL:**` in the header

## Persisting an Entry

Pass the fields to the tracker CLI; it uploads the report to Nextcloud and writes the
Postgres `Application` row (num, date, company, role, status, score, pdf flag, report link, notes):
```
npm run tracker -- save --num {num} --company "{company}" --role "{role}" \
  --status {status} --score {score} --report {num}-{slug}-{date}.md
```
Status must be a canonical value (see templates/states.yml).

## Canonical States

Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP
