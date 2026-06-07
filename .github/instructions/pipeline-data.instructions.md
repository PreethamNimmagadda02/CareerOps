---
description: "Use when working with pipeline data files: applications.md, pipeline.md, scan-history.tsv, batch state files, or tracker additions."
applyTo: "data/**, batch/**"
---

# Pipeline Data Conventions

## Tracker (data/applications.md)

- NEVER add new entries by editing applications.md directly
- Write TSV to `batch/tracker-additions/` and run `node merge-tracker.mjs`
- YES you can edit applications.md to UPDATE existing entries (status, notes)
- Status must be canonical (see templates/states.yml)

## Report Naming

Format: `{###}-{company-slug}-{YYYY-MM-DD}.md`
- `###` = next sequential number (3-digit zero-padded, max existing + 1)
- `company-slug` = company name lowercase, hyphens instead of spaces
- All reports MUST include `**URL:**` in the header

## TSV Format for Tracker Additions

Single line, 9 tab-separated columns:
```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

Column order: num, date, company, role, **status**, **score**, pdf, report, notes
(Note: status comes BEFORE score in TSV; merge-tracker handles column swap)

## Canonical States

Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP
