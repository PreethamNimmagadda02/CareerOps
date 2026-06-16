---
description: "Generate an ATS-optimized PDF CV tailored to a specific job description. Extracts keywords, rewrites summary, injects relevant terms, and produces PDF."
agent: "agent"
tools: [read, edit, execute]
---

# Generate Tailored PDF CV

Read the full PDF generation instructions from `modes/pdf.md` and execute them.

## Quick Reference — 13-Step Pipeline:

1. Read `cv.md` (source of truth)
2. Get JD from user (or from existing report if evaluating)
3. Extract 15-20 keywords from JD
4. Detect JD language → CV language (EN default)
5. Detect company location → paper format (US/Canada=letter, rest=A4)
6. Detect role archetype → adapt framing
7. Rewrite Professional Summary with keyword injection
8. Select top 3-4 relevant projects
9. Reorder work experience bullets by JD relevance
10. Build competency grid (6-8 keyword phrases)
11. Inject keywords naturally into achievements (**NEVER invent**)
12. Generate HTML from `templates/cv-template.html` using placeholders
13. Write HTML to temp file
14. Run: `npm run pdf -- <input.html> output/cv-candidate-{company}-{date}.pdf --format={letter|a4}`
15. Report: PDF path, page count, keyword coverage %

After generating, update tracker PDF column from ❌ to ✅ if offer already registered.
