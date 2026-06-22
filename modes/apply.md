# Mode: apply — Live Application Assistant

Interactive mode for when the candidate is filling out an application form in Chrome. It reads what's on screen, loads the prior context for the role, and generates personalized answers for each form question.

## Requirements

- **Best with Playwright visible**: In visible mode, the candidate sees the browser and Claude can interact with the page.
- **Without Playwright**: the candidate shares a screenshot or pastes the questions manually.

## Workflow

```
1. DETECT     → Read the active Chrome tab (screenshot/URL/title)
2. IDENTIFY   → Extract company + role from the page
3. SEARCH     → Match against applications in Postgres (`npm run tracker -- list --json`)
4. LOAD       → Download the report from Nextcloud (CareerOps-Reports/) + Section G (if it exists)
5. COMPARE    → Does the role on screen match the evaluated one? If it changed → warn
6. ANALYZE    → Identify ALL visible form questions
7. GENERATE   → For each question, generate a personalized answer
8. PRESENT    → Show formatted answers ready for copy-paste
```

## Step 1 — Detect the role

**With Playwright:** Take a snapshot of the active page. Read title, URL, and visible content.

**Without Playwright:** Ask the candidate to:
- Share a screenshot of the form (the Read tool reads images)
- Or paste the form questions as text
- Or state company + role so we can look it up

## Step 2 — Identify and load context

1. Extract the company name and role title from the page
2. Look up the application in Postgres: `npm run tracker -- list --json` → match by company (case-insensitive). The row contains the `report` link with the file name.
3. If there's a match → download the report from Nextcloud (`{NEXTCLOUD_URL}/remote.php/dav/files/{NEXTCLOUD_USER}/CareerOps-Reports/{filename}` with basic auth from `.env`)
4. If there's a Section G → load the previous draft answers as a base
5. If there's NO match → warn and offer to run a quick auto-pipeline

## Step 3 — Detect role changes

If the role on screen differs from the evaluated one:
- **Warn the candidate**: "The role has changed from [X] to [Y]. Do you want me to re-evaluate or adapt the answers to the new title?"
- **If adapting**: Adjust the answers to the new role without re-evaluating
- **If re-evaluating**: Run a full A-F evaluation, update the report, regenerate Section G
- **Update the tracker**: `npm run tracker -- update --id N --role "{new role}"` if appropriate

## Step 4 — Analyze the form questions

Identify ALL visible questions:
- Free-text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in Section G** → adapt the existing answer
- **New question** → generate an answer from the report + cv.md

## Step 5 — Generate answers

For each question, generate the answer following:

1. **Report context**: Use proof points from block B, STAR stories from block F
2. **Prior Section G**: If a draft answer exists, use it as a base and refine
3. **"I'm choosing you" tone**: Same framework as the auto-pipeline
4. **Specificity**: Reference something concrete from the JD visible on screen
5. **career-ops proof point**: Include it in "Additional info" if there's a field for it

**Output format:**

```
## Answers for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact form question]
> [Answer ready for copy-paste]

### 2. [Next question]
> [Answer]

...

---

Notes:
- [Any observation about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 6 — Post-apply (optional)

If the candidate confirms they submitted the application:
1. Update the status in Postgres: `npm run tracker -- update --id N --status Applied`
2. Update Section G of the report and re-upload it to Nextcloud (`npm run tracker -- save ...` with the updated report, or re-PUT the file via WebDAV)
3. Suggest the next step: `/career-ops contacto` for LinkedIn outreach

## Scroll handling

If the form has more questions than are visible:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the whole form is covered
